import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Library, ClipboardCheck, Sparkles, Timer, Quote, CalendarDays, Settings as SettingsIcon, LogOut, LogIn, ShieldCheck, Compass, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useAdminSettings, type PageKey } from "@/lib/adminSettings";
import { useLang } from "@/lib/i18n";

const items = [
  { to: "/", label: "Shelf", icon: Library, end: true },
  { to: "/recommendations", label: "Recommendations", icon: Compass },
  { to: "/oracle", label: "Concierge", icon: Sparkles },
  { to: "/ritual", label: "Reading Ritual", icon: Timer },
  { to: "/quotes", label: "Quotes Vault", icon: Quote },

  { to: "/history", label: "Book History", icon: BookMarked },
  { to: "/archive", label: "Archive", icon: CalendarDays },
  { to: "/review", label: "Review Desk", icon: ClipboardCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

interface Props { collapsed: boolean; onToggle: () => void; }

export function AppSidebar({ collapsed, onToggle }: Props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { settings } = useAdminSettings();
  const { t, lang } = useLang();
  const initial = (user?.user_metadata?.display_name || user?.email || "G")
    .toString().trim().charAt(0).toUpperCase();
  const handleSignOut = async () => {
    await signOut();
    toast.success(t("Signed out", "Signed out"));
    navigate("/auth", { replace: true });
  };
  return (
    <aside
      className={cn(
        "shrink-0 sticky top-0 h-screen z-20 border-r border-sidebar-border",
        "bg-sidebar text-sidebar-foreground",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[68px]" : "w-[232px]"
      )}
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="flex flex-col h-full">
        {/* Brand */}
        <button
          onClick={onToggle}
          className="group h-16 flex items-center gap-3 px-4 border-b border-sidebar-border hover:bg-sidebar-accent/40 transition-colors"
          aria-label={t("Toggle sidebar")}
        >
          <div className="relative shrink-0">
            <div className="w-8 h-8 border border-primary/60 flex items-center justify-center font-display text-primary text-lg lamp-flicker">
              {lang === "ar" ? "ل" : settings.brandInitial.slice(0, 2)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary/70 shadow-gold" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-[1.05rem] tracking-[0.18em] text-foreground">
                {lang === "ar" ? "ليكسيكون" : settings.brandName}
              </span>
              <span className="mono text-[0.55rem] tracking-[0.3em] text-muted-foreground">
                {lang === "ar" ? `تأسس ${new Date().getFullYear()}` : settings.establishedText}
              </span>
            </div>
          )}
        </button>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {items.filter(item => settings.nav[item.to as PageKey]?.visible !== false).map(item => {
            const Icon = item.icon;
            const active = item.end ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
            const label = t(settings.nav[item.to as PageKey]?.label ?? item.label, settings.nav[item.to as PageKey]?.label ?? item.label);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 text-sm transition-all rounded-sm",
                  "hover:bg-sidebar-accent/60 hover:text-foreground",
                  active
                    ? "text-primary bg-sidebar-accent/40"
                    : "text-sidebar-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary shadow-gold" />
                )}
                <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} strokeWidth={1.5} />
                {!collapsed && (
                  <span className={cn(
                    "font-display text-[0.95rem] tracking-wide",
                    active && "text-foreground"
                  )}>
                    {label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-2 py-3 border-t border-sidebar-border">
          {loading ? (
            <div className="h-10" />
          ) : (
            <button
              onClick={user ? handleSignOut : () => navigate("/auth")}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-2 rounded-sm",
                "hover:bg-sidebar-accent/60 transition-colors text-left"
              )}
              aria-label={user ? t("Sign out") : t("Sign in")}
            >
              <div className="w-7 h-7 shrink-0 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center font-display text-primary text-xs">
                {initial}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="font-display text-xs text-foreground truncate">
                    {user?.user_metadata?.display_name || user?.email || t("Guest shelf")}
                  </div>
                  <div className="mono text-[0.5rem] tracking-[0.25em] uppercase text-muted-foreground flex items-center gap-1">
                    {user ? <LogOut className="h-2.5 w-2.5" /> : <LogIn className="h-2.5 w-2.5" />}
                    {user ? t("Sign out") : t("Sign in to sync")}
                  </div>
                </div>
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
