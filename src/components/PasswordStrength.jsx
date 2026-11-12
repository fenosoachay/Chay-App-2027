import React from "react";

// Niveau de force du mot de passe.
// Fort (level 3) : 12+ caractères + majuscule + minuscule + chiffre + caractère spécial.
export function evalPassword(pw) {
  if (!pw) return { level: 0, label: "" };
  if (pw.length < 6) return { level: 0, label: "Trop court" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const strong =
    pw.length >= 12 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw);
  if (strong) return { level: 3, label: "Fort" };
  if (score >= 4 && pw.length >= 8) return { level: 2, label: "Moyen" };
  return { level: 1, label: "Faible" };
}

const SEG_COLORS = ["bg-destructive", "bg-amber-500", "bg-emerald-500"];
const LABEL_COLORS = ["text-destructive", "text-amber-600", "text-emerald-600"];

export default function PasswordStrength({ password }) {
  const { level, label } = evalPassword(password);
  if (!password) return null;
  const labelColor = level === 0 ? "text-destructive" : LABEL_COLORS[level - 1];
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= level ? SEG_COLORS[level - 1] : "bg-border"
            }`}
          />
        ))}
      </div>
      <span className={`text-[0.6875rem] font-bold ${labelColor}`}>{label}</span>
    </div>
  );
}