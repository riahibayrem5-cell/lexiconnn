import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme, THEMES, type ThemeId } from "@/lib/theme";
import { useShelfSettings } from "@/lib/shelfSettings";
import { DEFAULT_ADMIN_SETTINGS, useAdminSettings, writeAdminSettings, type PageKey } from "@/lib/adminSettings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_ORDER: PageKey[] = ["/", "/review", "/oracle", "/ritual", "/quotes", "/archive", "/admin", "/settings"];

export default function AdminPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const { settings, setSettings } = useAdminSettings();
  const { theme, setTheme } = useTheme();
  const { scaleMode, setScaleMode } = useShelfSettings();

  const patch = (next: typeof settings) => setSettings(next);
  const reset = () => {
    setSettings(DEFAULT_ADMIN_SETTINGS);
    writeAdminSettings(DEFAULT_ADMIN_SETTINGS);
    toast.success("Admin settings reset");
  };

  return (
    <div className={embedded ? "pb-6" : "min-h-screen pb-24"}>
      {!embedded && (
        <PageHeader
          eyebrow="Admin Panel"
          title=""
          titleMain="Edit the"
          titleEmphasis="whole website"
          subtitle="Customize identity, navigation, copy, behavior, recommendations, and visual depth."
          right={<Button onClick={() => toast.success("Everything is saved automatically")} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"><Save className="h-4 w-4 mr-2" /> Saved live</Button>}
        />
      )}

      <div className="px-4 sm:px-8 lg:px-14 mt-8 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Site identity</p>
            <SlidersHorizontal className="h-5 w-5 text-primary" />
          </div>
          <AdminInput label="Brand name" value={settings.brandName} onChange={(v) => patch({ ...settings, brandName: v })} />
          <AdminInput label="Brand mark" value={settings.brandInitial} onChange={(v) => patch({ ...settings, brandInitial: v.slice(0, 2) || "L" })} />
          <AdminInput label="Sidebar subtitle" value={settings.establishedText} onChange={(v) => patch({ ...settings, establishedText: v })} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <ToggleCard active={settings.agentEnabled} label="Floating agent" onClick={() => patch({ ...settings, agentEnabled: !settings.agentEnabled })} />
            <ToggleCard active={settings.shelfCoverReveal} label="Click spine to reveal cover" onClick={() => patch({ ...settings, shelfCoverReveal: !settings.shelfCoverReveal })} />
          </div>
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5">
          <p className="eyebrow">Visual system</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id as ThemeId)} className={cn("rounded-sm border p-3 text-left transition-all hover:-translate-y-0.5", theme === t.id ? "border-primary bg-primary/10 shadow-foil" : "border-border/50 hover:border-primary/40")}>
                <div className="h-10 rounded-sm mb-3" style={{ background: `linear-gradient(90deg, ${t.swatch[0]}, ${t.swatch[1]}, ${t.swatch[2]})` }} />
                <p className="font-display text-sm text-foreground">{t.name}</p>
              </button>
            ))}
          </div>
          <RangeControl label="Premium depth" value={settings.premiumDepth} min={0} max={100} onChange={(v) => patch({ ...settings, premiumDepth: v })} />
          <div className="grid grid-cols-2 gap-3">
            <ToggleCard active={scaleMode === "compact"} label="Compact spines" onClick={() => setScaleMode("compact")} />
            <ToggleCard active={scaleMode === "true"} label="True page thickness" onClick={() => setScaleMode("true")} />
          </div>
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5 xl:col-span-2">
          <p className="eyebrow">Navigation editor</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {PAGE_ORDER.map(page => (
              <div key={page} className="rounded-sm border border-border/50 p-3 space-y-2">
                <label className="flex items-center gap-2 mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground">
                  <input type="checkbox" checked={settings.nav[page].visible} onChange={(e) => patch({ ...settings, nav: { ...settings.nav, [page]: { ...settings.nav[page], visible: e.target.checked } } })} />
                  Visible · {page}
                </label>
                <Input value={settings.nav[page].label} onChange={(e) => patch({ ...settings, nav: { ...settings.nav, [page]: { ...settings.nav[page], label: e.target.value } } })} className="bg-input/60 font-serif" />
              </div>
            ))}
          </div>
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5 xl:col-span-2">
          <p className="eyebrow">Every page header</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PAGE_ORDER.map(page => (
              <div key={page} className="rounded-sm border border-border/50 p-4 space-y-3">
                <p className="font-display text-lg text-primary">{settings.nav[page].label}</p>
                <AdminInput label="Eyebrow" value={settings.pages[page].eyebrow} onChange={(v) => patch({ ...settings, pages: { ...settings.pages, [page]: { ...settings.pages[page], eyebrow: v } } })} />
                <AdminInput label="Title" value={settings.pages[page].title} onChange={(v) => patch({ ...settings, pages: { ...settings.pages, [page]: { ...settings.pages[page], title: v } } })} />
                <AdminInput label="Emphasis" value={settings.pages[page].emphasis} onChange={(v) => patch({ ...settings, pages: { ...settings.pages, [page]: { ...settings.pages[page], emphasis: v } } })} />
                <textarea value={settings.pages[page].subtitle} onChange={(e) => patch({ ...settings, pages: { ...settings.pages, [page]: { ...settings.pages[page], subtitle: e.target.value } } })} className="min-h-20 w-full rounded-sm border border-border/50 bg-input/60 px-3 py-2 font-serif text-sm outline-none focus:border-primary" />
              </div>
            ))}
          </div>
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5 xl:col-span-2">
          <p className="eyebrow">Oracle controls</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <RangeControl label="Recommendation cards" value={settings.oracleCards} min={1} max={8} onChange={(v) => patch({ ...settings, oracleCards: v })} />
            <RangeControl label="Description words" value={settings.oracleDescriptionWords} min={18} max={70} onChange={(v) => patch({ ...settings, oracleDescriptionWords: v })} />
          </div>
        </section>

        <section className="xl:col-span-2 flex justify-end">
          <Button onClick={reset} variant="outline" className="border-border-strong/60 text-muted-foreground hover:text-primary"><RotateCcw className="h-4 w-4 mr-2" /> Reset customization</Button>
        </section>
      </div>
    </div>
  );
}

function AdminInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-2"><span className="mono text-[0.55rem] tracking-[0.22em] uppercase text-muted-foreground">{label}</span><Input value={value} onChange={(e) => onChange(e.target.value)} className="bg-input/60 font-serif" /></label>;
}

function ToggleCard({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={cn("rounded-sm border p-4 text-left transition-all", active ? "border-primary bg-primary/10 text-primary shadow-foil" : "border-border/50 text-muted-foreground hover:border-primary/40")}>{label}</button>;
}

function RangeControl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block space-y-2"><span className="mono text-[0.55rem] tracking-[0.22em] uppercase text-muted-foreground">{label} · {value}</span><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" /></label>;
}