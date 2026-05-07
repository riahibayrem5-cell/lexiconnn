import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t, lang } = useLang();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to your library.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed");
        setBusy(false);
      }
      // result.redirected → browser navigates away
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 border border-primary/60 font-display text-primary text-3xl lamp-flicker mx-auto mb-5">
            L
          </div>
          <h1 className="font-display text-4xl text-foreground">{lang === "ar" ? "ليكسيكون" : "LEXICON"}</h1>
          <p className="mt-3 italic text-muted-foreground text-sm">
            {t("Sign in to sync", "Sign in to sync your shelf, or keep browsing as a guest.")}
          </p>
        </div>

        <div className="ink-card rounded-sm p-7 space-y-5">
          <div className="flex gap-1 mono text-[0.6rem] tracking-[0.25em] uppercase">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 transition-colors ${mode === "signin" ? "text-primary border-b border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >{t("Sign in", "Sign In")}</button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 transition-colors ${mode === "signup" ? "text-primary border-b border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >{t("Create your library", "Create Account")}</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label className="eyebrow">{t("Display name", "Name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("Display name", "What should we call you?")}
                  className="bg-input border-border-strong/40 font-serif"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="eyebrow">{t("Email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="bg-input border-border-strong/40 font-serif"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="eyebrow">{t("Password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="bg-input border-border-strong/40 font-serif"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signup" ? t("Create your library", "Create my library") : t("Sign in", "Open my library")}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-border/60" /></div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 mono text-[0.55rem] tracking-[0.3em] uppercase text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={google}
            disabled={busy}
            className="w-full border-border-strong/40 font-display tracking-wider"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            {t("Continue with Google")}
          </Button>
        </div>

        <p className="mt-6 text-center mono text-[0.55rem] tracking-[0.3em] uppercase text-muted-foreground/60">
          Optional account · synced across devices
        </p>
      </div>
    </div>
  );
}