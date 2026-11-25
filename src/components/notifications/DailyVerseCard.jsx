import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toISODate } from "@/lib/localDate";

export default function DailyVerseCard({ user }) {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("08:00");
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [saving, setSaving] = useState(false);
  const lastRef = useRef("");

  useEffect(() => {
    if (user?.daily_verse_enabled) setEnabled(true);
    if (user?.daily_verse_time) setTime(user.daily_verse_time);
  }, [user]);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    const check = async () => {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      // Date LOCALE : toISOString() renvoie l'heure UTC et faisait partir la
      // notification sur la date d'hier entre minuit et 3 h (UTC+3).
      const today = toISODate(now);
      if (hhmm === time && lastRef.current !== today) {
        lastRef.current = today;
        try {
          const devs = await base44.entities.Devotional
            .filter({ reading_date: today }, "-reading_date", 1)
            .catch(() => []);
          const dev = Array.isArray(devs) && devs[0] ? devs[0] : null;
          const body = dev
            ? `${dev.verse_text || dev.title} — ${dev.scripture_reference || ""}`
            : "«\u00a0Je puis tout par celui qui me fortifie.\u00a0» — Philippiens\u00a04:13";
          new Notification("Verset du jour — CHAY", { body });
        } catch {
          /* ignore */
        }
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [enabled, time, permission]);

  const toggle = async () => {
    if (!enabled) {
      if (typeof Notification === "undefined") {
        setPermission("unsupported");
        return;
      }
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        setPermission(p);
        if (p !== "granted") return;
      }
    }
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await base44.auth.updateMe({
        daily_verse_enabled: next,
        daily_verse_time: time,
      });
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const changeTime = async (e) => {
    setTime(e.target.value);
    if (enabled) {
      try {
        await base44.auth.updateMe({ daily_verse_time: e.target.value });
      } catch {
        /* ignore */
      }
    }
  };

  const supported = typeof Notification !== "undefined";
  const status = !supported
    ? "Notifications non supportées sur cet appareil"
    : enabled
      ? "Vous serez notifié chaque jour"
      : "Recevez le verset chaque jour à l'heure choisie";

  return (
    <div className="rounded-[1.5rem] border border-border bg-card p-5">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center text-primary shrink-0">
          {enabled ? <Bell className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base">Verset du jour</div>
          <div className="text-xs text-muted-foreground leading-snug">{status}</div>
        </div>
        <Switch
          checked={enabled && supported}
          onCheckedChange={toggle}
          disabled={saving || !supported}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground/70 shrink-0">Heure</span>
        <input
          type="time"
          value={time}
          onChange={changeTime}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}