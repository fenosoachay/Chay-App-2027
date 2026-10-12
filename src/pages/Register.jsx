import React, { cloneElement, useId, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { saveLocalSession } from '@/lib/localSession';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import DrawerSelect from "@/components/DrawerSelect";
import { useToast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import {
  UserPlus,
  Mail,
  Lock,
  Loader2,
  MapPin,
  Check as CheckIcon,
  Phone,
  CalendarDays,
  User,
  Home,
  Droplet,
  Heart,
  ChevronLeft,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import PasswordInput from "@/components/PasswordInput";
import { dialFor, formatPhoneFor } from "@/lib/countryDial";
import { canSubmitRegistration } from "@/lib/registrationValidation";

const GENDERS = [
  { label: "Homme", value: "Homme" },
  { label: "Femme", value: "Femme" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneStripped = (p) => "+" + (p || "").replace(/[^\d]/g, "");
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

function Field({ label, icon: Icon, children, hint, required, error }) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const input = React.isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": errorId,
      })
    : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />} {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {input}
      {error ? (
        <p id={errorId} className="text-[11px] text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-foreground/45">{hint}</p>
      ) : null}
    </div>
  );
}

function ConsentRow({ checked, onChange, children }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[#378ADD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <label htmlFor={id} className="text-sm text-foreground/80 selectable cursor-pointer">
        {children}
      </label>
    </div>
  );
}

export default function Register() {
  const { toast } = useToast();
  const [step, setStep] = useState(0); // 0 = form, 1 = OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [showCgu, setShowCgu] = useState(false);

  // required
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // optional
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [conversionDate, setConversionDate] = useState("");
  const [baptized, setBaptized] = useState(false);
  const [baptismDate, setBaptismDate] = useState("");
  const [church, setChurch] = useState("");
  const [bio, setBio] = useState("");
  const [spiritualJourney, setSpiritualJourney] = useState("");
  const [knownChaySince, setKnownChaySince] = useState("");

  // consents
  const [respectConsent, setRespectConsent] = useState(false);
  const [acceptCgu, setAcceptCgu] = useState(false);
  const [loc, setLoc] = useState(null);
  const [locStatus, setLocStatus] = useState("");

  // L'indicatif téléphonique suit automatiquement le pays sélectionné.
  useEffect(() => {
    if (country) setPhone("+" + dialFor(country));
  }, [country]);

  const passwordValid = password.length > 0;
  const phoneValid = PHONE_RE.test(phoneStripped(phone));
  const emailValid = EMAIL_REGEX.test(email.trim());
  const passwordMatch = password === confirmPassword && password.length > 0;

  const fst = (v, valid) => (!v.trim() ? "neutral" : valid ? "valid" : "invalid");
  const pwState = !password ? "neutral" : passwordValid ? "valid" : "invalid";
  const cpState = !confirmPassword ? "neutral" : passwordMatch ? "valid" : "invalid";
  const borderFor = (st) =>
    st === "valid"
      ? "!border-emerald-500 focus:!border-emerald-500"
      : st === "invalid"
      ? "!border-destructive focus:!border-destructive"
      : "";

  const canSubmit = canSubmitRegistration({
    firstName,
    lastName,
    gender,
    emailValid,
    phoneValid,
    country,
    city,
    passwordValid,
    passwordMatch,
    respectConsent,
    acceptCgu,
    loading,
  });

  const getLocation = async () => {
    if (!navigator.geolocation) {
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("loading");
    // On interroge l'état réel de la permission via l'API Permissions : certains
    // appareils renvoient une erreur getCurrentPosition alors que la permission
    // OS est déjà accordée. On ne bloque alors pas l'inscription.
    let permGranted = false;
    try {
      if (navigator.permissions?.query) {
        const res = await navigator.permissions.query({ name: "geolocation" });
        permGranted = res.state === "granted";
      }
    } catch {
      /* Permissions API non disponible */
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
        setError("");
      },
      (err) => {
        const code = err?.code;
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        // On n'affiche « Accès refusé » que si la permission est réellement
        // refusée. Sinon (permission accordée mais position indisponible ou
        // timeout), on considère la localisation comme activée pour ne pas
        // bloquer l'inscription à tort.
        if (code === 1 && !permGranted) {
          setLocStatus("denied");
        } else {
          setLocStatus("granted");
          setError("");
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    if (!canSubmit) {
      if (!emailValid) {
        setError("Saisissez une adresse e-mail valide.");
        return;
      }
      setError("Veuillez compléter tous les champs obligatoires et accepter les conditions.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email: email.trim(), password });
      setStep(1);
    } catch (err) {
      const msg = err?.message || "";
      if (/already|exists|utilisé|existe|registered|taken|duplicate/i.test(msg)) {
        setError("Un compte existe déjà avec cet email.");
      } else {
        setError(msg || "Échec de l'inscription");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email: email.trim(), otpCode });
      if (result?.access_token) base44.auth.setToken(result.access_token);
      await base44.auth.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender,
        phone: phone.trim(),
        country,
        city: city.trim(),
        location_lat: loc?.lat ?? null,
        location_lng: loc?.lng ?? null,
        location_label: `${city.trim()}, ${country}`,
        localisation_activee: Boolean(loc),
        birth_date: birthDate || null,
        birth_place: birthPlace || null,
        conversion_date: conversionDate || null,
        baptized,
        baptism_date: baptized ? baptismDate || null : null,
        church: baptized ? church || null : null,
        bio: bio || null,
        spiritual_journey: spiritualJourney || null,
        known_chay_since: knownChaySince || null,
        accepte_commentaires_respect: respectConsent,
        accepte_cookies: false,
        accepte_cgu: acceptCgu,
        consents_accepted: true,
      });
      saveLocalSession(await base44.auth.me());
      toast({ title: "Bienvenue sur CHAY", description: "Votre compte a été créé." });
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err?.message || "Code de vérification invalide");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email.trim());
      toast({ title: "Code envoyé", description: "Vérifiez votre e-mail." });
    } catch (err) {
      setError(err?.message || "Échec du renvoi");
    }
  };

  const loginLink =
    "/login" +
    (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "");

  // ---------- OTP step ----------
  if (step === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-[#E6F1FB] dark:bg-[#0C447C]/40 grid place-items-center">
              <Mail className="h-7 w-7 text-[#0C447C] dark:text-[#6FB3FF]" />
            </div>
            <h1 className="font-display font-extrabold text-2xl text-[#0C447C] dark:text-[#E6F1FB]">
              Vérifiez votre e-mail
            </h1>
            <p className="text-sm text-foreground/60 mt-1">
              Nous avons envoyé un code à {email}
            </p>
          </div>
          {error && (
            <div role="alert" className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="flex justify-center mb-6">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            className="w-full h-12 font-medium bg-[#185FA5] hover:bg-[#0C447C] dark:bg-[#3B8FD9] dark:hover:bg-[#6FB3FF] text-white border-0"
            onClick={verifyOtp}
            disabled={loading || otpCode.length < 6}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Vérification…
              </>
            ) : (
              "Vérifier"
            )}
          </Button>
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setStep(0)}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Modifier le formulaire
            </button>
            <button
              onClick={resendOtp}
              className="text-sm text-[#0C447C] dark:text-[#6FB3FF] font-medium hover:underline"
            >
              Renvoyer le code
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Form step ----------
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-[#E6F1FB] dark:bg-[#0C447C]/40 grid place-items-center">
            <UserPlus className="h-7 w-7 text-[#0C447C] dark:text-[#6FB3FF]" />
          </div>
          <h1 className="font-display font-extrabold text-3xl text-[#0C447C] dark:text-[#E6F1FB]">
            Créer un compte
          </h1>
          <p className="mt-2 text-foreground/60">
            Rejoignez la communauté CHAY
          </p>
        </header>

        <form onSubmit={submitForm} className="space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Main block — required */}
          <section className="rounded-2xl border border-border bg-muted/40 p-5 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wide text-foreground/50">
              Informations obligatoires
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" icon={User} required error={firstName && firstName.trim().length < 2 ? "2 caractères minimum" : null}>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  className={`h-11 ${borderFor(fst(firstName, firstName.trim().length >= 2))}`}
                />
              </Field>
              <Field label="Nom" icon={User} required error={lastName && lastName.trim().length < 2 ? "2 caractères minimum" : null}>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rakoto"
                  className={`h-11 ${borderFor(fst(lastName, lastName.trim().length >= 2))}`}
                />
              </Field>
            </div>
            <Field label="Genre" required>
              <DrawerSelect
                value={gender}
                onChange={setGender}
                title="Genre"
                options={GENDERS}
                placeholder="Sélectionner…"
                triggerClassName="w-full h-11"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pays" icon={MapPin} required>
                <DrawerSelect
                  value={country}
                  onChange={setCountry}
                  title="Pays"
                  searchable
                  options={COUNTRY_OPTIONS}
                  placeholder="Sélectionner…"
                  triggerClassName="w-full h-11"
                />
              </Field>
              <Field label="Ville" icon={MapPin} required error={city && city.trim().length === 0 ? "Ville requise" : null}>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Antananarivo"
                  className={`h-11 ${borderFor(fst(city, city.trim().length > 0))}`}
                />
              </Field>
            </div>
            <Field label="Téléphone" icon={Phone} required hint="Indicatif et format définis selon le pays sélectionné" error={phone && phoneStripped(phone) !== "+" + dialFor(country) && !phoneValid ? "Numéro invalide" : null}>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneFor(country, e.target.value))}
                placeholder={country ? "+" + dialFor(country) : "+33 2 23 23 22 22"}
                className={`h-11 ${borderFor(fst(phone, phoneValid))}`}
              />
            </Field>
            <Field
              label="E-mail"
              icon={Mail}
              required
              error={email && !emailValid ? "Adresse e-mail invalide." : null}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className={`h-11 ${borderFor(fst(email, emailValid))}`}
              />
            </Field>
            <Field
              label="Mot de passe"
              icon={Lock}
              required
              hint="Choisissez le mot de passe que vous souhaitez."
            >
              <PasswordInput
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`h-11 ${borderFor(pwState)}`}
              />
            </Field>
            <Field
              label="Confirmer le mot de passe"
              icon={Lock}
              required
              error={confirmPassword && !passwordMatch ? "Les mots de passe ne correspondent pas" : null}
            >
              <PasswordInput
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={`h-11 ${borderFor(cpState)}`}
              />
            </Field>
          </section>

          {/* Collapsible optional section */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((s) => !s)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="flex items-center gap-2 font-display font-bold text-[#0C447C] dark:text-[#6FB3FF]">
                <Heart className="h-4 w-4" /> Pour mieux vous connaître
              </span>
              <ChevronDown
                className={`h-5 w-5 text-[#0C447C] dark:text-[#6FB3FF] transition-transform ${
                  showOptional ? "rotate-180" : ""
                }`}
              />
            </button>
            <p className="px-5 -mt-1 pb-3 text-xs text-foreground/45">
              Les champs suivants ne sont pas obligatoires, mais nous aimerions
              mieux vous connaître.
            </p>
            {showOptional && (
              <section className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date de naissance" icon={CalendarDays}>
                    <Input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="h-11"
                    />
                  </Field>
                  <Field label="Lieu de naissance" icon={Home}>
                    <Input
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      placeholder="Ville"
                      className="h-11"
                    />
                  </Field>
                </div>
                <Field label="Date de conversion" icon={Heart}>
                  <Input
                    type="date"
                    value={conversionDate}
                    onChange={(e) => setConversionDate(e.target.value)}
                    className="h-11"
                  />
                </Field>
                <ConsentRow checked={baptized} onChange={setBaptized}>
                  <span className="font-semibold">J'ai été baptisé(e)</span>
                </ConsentRow>
                {baptized && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date de baptême" icon={Droplet}>
                      <Input
                        type="date"
                        value={baptismDate}
                        onChange={(e) => setBaptismDate(e.target.value)}
                        className="h-11"
                      />
                    </Field>
                    <Field label="Église" icon={Home}>
                      <Input
                        value={church}
                        onChange={(e) => setChurch(e.target.value)}
                        placeholder="Nom de l'église"
                        className="h-11"
                      />
                    </Field>
                  </div>
                )}
                <Field label="Bio">
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    placeholder="Quelques mots sur vous…"
                  />
                </Field>
                <Field label="Parcours spirituel">
                  <Textarea
                    value={spiritualJourney}
                    onChange={(e) => setSpiritualJourney(e.target.value)}
                    rows={2}
                    placeholder="Votre cheminement avec Dieu…"
                  />
                </Field>
                <Field label="Depuis quand connaissez-vous l'Église Chay ?" icon={CalendarDays}>
                  <Input
                    type="date"
                    value={knownChaySince}
                    onChange={(e) => setKnownChaySince(e.target.value)}
                    className="h-11"
                  />
                </Field>
              </section>
            )}
          </div>

          {/* Consents + location */}
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <ConsentRow checked={respectConsent} onChange={setRespectConsent}>
              <span lang="mg">
                Malalaka ny fanehoan-kevitra sy commentaires amin'ny actualités
                ato amin'ny Application Chay fa atao am-panajana tanteraka.
              </span>
            </ConsentRow>
            <ConsentRow checked={acceptCgu} onChange={setAcceptCgu}>
              J'accepte les conditions d'utilisation.
            </ConsentRow>
            <button
              type="button"
              onClick={() => setShowCgu(true)}
              className="text-sm text-[#0C447C] dark:text-[#6FB3FF] font-medium hover:underline"
            >
              Lire les conditions d'utilisation
            </button>

            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground/50">
                <MapPin className="h-3.5 w-3.5" /> Localisation
              </div>
              <p className="text-xs text-foreground/50">
                Facultatif : votre position précise n'est utilisée que si vous
                l'autorisez, pour personnaliser les informations locales. Vous
                pouvez continuer sans l'activer.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  variant={locStatus === "granted" ? "secondary" : "default"}
                  onClick={getLocation}
                  className="h-11 bg-[#185FA5] hover:bg-[#0C447C] dark:bg-[#3B8FD9] dark:hover:bg-[#6FB3FF] text-white"
                >
                  {locStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : locStatus === "granted" ? (
                    <CheckIcon className="h-4 w-4 mr-2" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2" />
                  )}
                  {locStatus === "granted"
                    ? "Localisation activée"
                    : "Activer ma localisation"}
                </Button>
                {locStatus !== "granted" && (
                  <span className="text-xs text-foreground/50">
                    Aucun accès à votre position n'a encore été accordé.
                  </span>
                )}
                {locStatus === "denied" && (
                  <span className="text-xs text-destructive font-medium">
                    Accès refusé — réessayez
                  </span>
                )}
                {locStatus === "unsupported" && (
                  <span className="text-xs text-destructive font-medium">
                    Non supporté sur cet appareil
                  </span>
                )}
              </div>
            </div>
          </section>

          <Button
            type="submit"
            className="w-full h-12 font-medium bg-[#185FA5] hover:bg-[#0C447C] dark:bg-[#3B8FD9] dark:hover:bg-[#6FB3FF] text-white border-0"
            disabled={!canSubmit}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Création…
              </>
            ) : (
              "S'inscrire"
            )}
          </Button>

          <p className="text-center text-sm text-foreground/60">
            Déjà un compte ?{" "}
            <Link to={loginLink} className="text-[#0C447C] dark:text-[#6FB3FF] font-medium hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </div>

      {/* CGU dialog */}
      <Dialog open={showCgu} onOpenChange={setShowCgu}>
        <DialogContent className="max-w-lg rounded-[1.5rem] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0C447C] dark:text-[#6FB3FF]">
              <ShieldCheck className="h-5 w-5" /> Termes et conditions
            </DialogTitle>
            <DialogDescription>
              Conditions d'utilisation de l'Application Chay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-foreground/80 selectable">
            <p>
              En créant un compte sur l'Application Chay, vous acceptez les
              présentes conditions d'utilisation.
            </p>
            <p>
              Vous vous engagez à publier des commentaires respectueux, à ne
              pas diffuser de contenu injurieux, diffamatoire ou contraire à
              l'esprit de la communauté chrétienne de l'Église Chay.
            </p>
            <p>
              Les informations de profil et contenus que vous fournissez sont
              traités par les services techniques utilisés pour faire
              fonctionner l'application et ses notifications. La position
              précise est facultative et n'est enregistrée que si vous
              l'autorisez. N'ajoutez pas d'informations sensibles que vous ne
              souhaitez pas partager avec les personnes autorisées à consulter
              votre profil. Pour demander l'accès ou la suppression de vos
              données, contactez l'équipe CHAY.
            </p>
            <p>
              La modération se réserve le droit de retirer tout contenu
              inapproprié et de suspendre les comptes ne respectant pas la
              charte.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}