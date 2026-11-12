import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import PrefSwitch from "@/components/settings/PrefSwitch";
import { Loader2, Save, Lock } from "lucide-react";

export default function SpiritualSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        conversion_date: user.conversion_date || "",
        baptized: user.baptized || false,
        baptism_date: user.baptism_date || "",
        church: user.church || "",
        birth_place: user.birth_place || "",
        bio: user.bio || "",
        spiritual_journey: user.spiritual_journey || "",
        known_chay_since: user.known_chay_since || "",
      });
    }
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(form);
      toast({ title: "Parcours enregistré" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/40 p-3 text-xs text-foreground/60 flex items-start gap-2">
        <Lock className="h-4 w-4 mt-0.5 shrink-0" />
        Ces informations sont privées et visibles uniquement par vous.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Date de conversion</Label>
          <Input
            type="date"
            value={form.conversion_date || ""}
            onChange={(e) => set("conversion_date", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div>
          <Label className="text-xs">Lieu de naissance</Label>
          <Input
            value={form.birth_place || ""}
            onChange={(e) => set("birth_place", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      </div>

      <PrefSwitch
        label="Baptisé(e)"
        checked={!!form.baptized}
        onChange={(v) => set("baptized", v)}
      />

      {form.baptized && (
        <div>
          <Label className="text-xs">Date du baptême</Label>
          <Input
            type="date"
            value={form.baptism_date || ""}
            onChange={(e) => set("baptism_date", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      )}

      <div>
        <Label className="text-xs">Église</Label>
        <Input
          value={form.church || ""}
          onChange={(e) => set("church", e.target.value)}
          className="mt-1 h-10"
        />
      </div>

      <div>
        <Label className="text-xs">
          Depuis quand connaissez-vous l'Église Chay ?
        </Label>
        <Input
          value={form.known_chay_since || ""}
          onChange={(e) => set("known_chay_since", e.target.value)}
          className="mt-1 h-10"
          placeholder="Ex. 2018"
        />
      </div>

      <div>
        <Label className="text-xs">Biographie</Label>
        <Textarea
          value={form.bio || ""}
          onChange={(e) => set("bio", e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>

      <div>
        <Label className="text-xs">Parcours spirituel</Label>
        <Textarea
          value={form.spiritual_journey || ""}
          onChange={(e) => set("spiritual_journey", e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Enregistrer
      </Button>
    </div>
  );
}