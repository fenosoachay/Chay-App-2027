import React from "react";
import { usePreferences } from "@/lib/PreferencesContext";
import PrefSwitch from "@/components/settings/PrefSwitch";
import { TAILLES_POLICE, enregistrerTaillePolice, lireTaillePolice } from "@/lib/taillePolice";

function Segmented({ options, value, onChange, labels, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // Grande police : les boutons passent à la ligne au lieu de rétrécir (aucun libellé coupé).
      className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))]"
    >
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`min-h-10 px-2 py-1 rounded-xl border text-sm font-semibold ${
            value === o
              ? "brand-gradient text-white border-transparent"
              : "border-border bg-card"
          }`}
        >
          {labels ? labels[i] : o}
        </button>
      ))}
    </div>
  );
}

export default function DisplaySection() {
  const { prefs, setPref } = usePreferences();
  const [taille, setTaille] = React.useState(() => lireTaillePolice());

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold mb-1.5">Thème</p>
        <Segmented
          options={["light", "dark", "auto"]}
          value={prefs.theme}
          onChange={(v) => setPref("theme", v)}
          labels={["Clair", "Sombre", "Auto"]}
        />
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5">Taille du texte</p>
        <Segmented
          ariaLabel="Taille du texte"
          options={TAILLES_POLICE}
          value={taille}
          onChange={(v) => setTaille(enregistrerTaillePolice(v))}
          labels={TAILLES_POLICE.map((t) => `${t} %`)}
        />
        <p className="text-xs text-foreground/50 mt-1">
          S'applique à toute l'application, sur cet appareil seulement.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5">Langue</p>
        <div className="flex items-center gap-2 text-sm text-foreground/60">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            FR
          </span>
          Français
        </div>
        <p className="text-xs text-foreground/50 mt-1">
          L'interface est actuellement disponible en français. Les passages
          rédigés en malgache sont conservés dans leur langue d'origine.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5">Densité de l'interface</p>
        <Segmented
          options={["comfortable", "compact"]}
          value={prefs.density}
          onChange={(v) => setPref("density", v)}
          labels={["Confortable", "Compacte"]}
        />
      </div>

      <div className="border-t border-border" />
      <PrefSwitch
        label="Contraste renforcé"
        checked={prefs.contrast === "high"}
        onChange={(v) => setPref("contrast", v ? "high" : "normal")}
      />
      <PrefSwitch
        label="Réduire les animations"
        description="Limite les animations et transitions."
        checked={prefs.reduce_animations}
        onChange={(v) => setPref("reduce_animations", v)}
      />

      <div className="border-t border-border" />
      <PrefSwitch
        label="Lecture automatique de l'audio"
        checked={prefs.autoplay_audio}
        onChange={(v) => setPref("autoplay_audio", v)}
      />
      <PrefSwitch
        label="Lecture automatique des vidéos"
        checked={prefs.autoplay_video}
        onChange={(v) => setPref("autoplay_video", v)}
      />
    </div>
  );
}
