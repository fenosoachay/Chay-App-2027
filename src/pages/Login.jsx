import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { saveLocalSession } from '@/lib/localSession';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { safeReturnTo } from "@/lib/authReturnTo";
import LoginButton from "@/components/auth/LoginButton";
import PasswordInput from "@/components/PasswordInput";

const LOGO_URL =
  "https://media.base44.com/images/public/6aa138d0e963d9e5f59d838c/0a45870cf_Untitled_design__2_-removebg-preview.png";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapLoginError(msg) {
  const m = (msg || "").toLowerCase();
  if (/verif|non vérifié|unverified|not verified|verify your|email.*verif/i.test(m))
    return "Votre email n'est pas encore vérifié. Veuillez vérifier votre boîte mail.";
  if (/block|bloqué|too many|rate limit|attempt|locked/i.test(m))
    return "Trop de tentatives de connexion. Veuillez réessayer dans quelques minutes.";
  return "Email ou mot de passe incorrect.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [btnState, setBtnState] = useState("idle"); // idle | loading | success | error
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (btnState === "loading" || btnState === "success") return;
    setError("");
    // Validation préalable : pas d'animation de chargement si invalide.
    if (!EMAIL_REGEX.test(email.trim()) || !password) {
      setError("Veuillez saisir un email valide et votre mot de passe.");
      return;
    }
    setBtnState("loading");
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      saveLocalSession(await base44.auth.me());
      // Au retour sur l'accueil, la session est validée automatiquement (un seul clic).
      try { sessionStorage.setItem("chay_just_logged_in", "1"); } catch { /* ignoré */ }
      setBtnState("success");
      setTimeout(() => {
        window.location.href = returnTo;
      }, 600);
    } catch (err) {
      setError(mapLoginError(err?.message));
      setBtnState("error");
      setTimeout(() => setBtnState("idle"), 600);
    }
  };

  const registerLink =
    "/register" +
    (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "");

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1220] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo — seule zone en dégradé */}
        <div className="flex justify-center mb-6">
          <img src={LOGO_URL} alt="Chay" className="h-20 w-20 md:h-24 md:w-24 rounded-2xl" />
        </div>

        <h1 className="text-center font-display font-extrabold text-2xl text-[#111827] dark:text-[#E6F1FB] mb-1">
          Content de vous revoir
        </h1>
        <p className="text-center text-sm text-[#4B5563] dark:text-[#99C9FF] mb-6">
          Connectez-vous à votre compte CHAY
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#FDECEC] dark:bg-[#3A2530] text-[#B3261E] dark:text-[#E57373] text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[#4B5563] dark:text-[#99C9FF]">
              E-mail
            </Label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="chay@chay.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 border-[#D1D5DB] dark:border-[#374151] focus:border-[#C857A8] dark:focus:border-[#D48FD4] focus-visible:ring-[#C857A8]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="text-[#4B5563] dark:text-[#99C9FF]"
              >
                Mot de passe
              </Label>
              <Link
                to="/forgot-password"
                className="text-xs text-[#6B2D6B] dark:text-[#B06FB0] font-medium hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <PasswordInput
              id="password"
              leftIcon={Lock}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 border-[#D1D5DB] dark:border-[#374151] focus:border-[#C857A8] dark:focus:border-[#D48FD4] focus-visible:ring-[#C857A8]"
            />
          </div>

          <LoginButton state={btnState} disabled={btnState !== "idle"} />
        </form>

        <p className="text-center text-sm text-[#4B5563] dark:text-[#99C9FF] mt-6">
          Pas encore de compte ?{" "}
          <Link
            to={registerLink}
            className="text-[#6B2D6B] dark:text-[#B06FB0] font-medium hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}