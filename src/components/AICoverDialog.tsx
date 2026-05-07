import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";

const STYLES = [
  "Penguin Classics", "NYRB Editions", "Faber poetry", "Modernist",
  "Brutalist", "Watercolor", "Mid-century pulp", "Minimal Swiss", "Art Nouveau",
];
const PALETTES = [
  "muted earth tones", "stark black & red", "pastel & cream",
  "deep ocean blues", "warm ochre & ivory", "monochrome",
];
const MOODS = ["melancholic", "haunting", "luminous", "tender", "ironic", "epic"];
const TYPOS = ["serif display", "bold sans", "hand-lettered", "engraved", "stencil"];
const IMAGERIES = ["abstract", "botanical", "geometric", "figurative silhouette", "photographic still life"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  author: string;
  year?: number;
  hint?: string;
  onGenerated: (url: string) => void;
}

export function AICoverDialog({ open, onOpenChange, title, author, year, hint, onGenerated }: Props) {
  const { lang } = useLang();
  const [style, setStyle] = useState(STYLES[0]);
  const [palette, setPalette] = useState(PALETTES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [typography, setTypography] = useState(TYPOS[0]);
  const [imagery, setImagery] = useState(IMAGERIES[0]);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", {
        body: { title, author, year, hint, style, palette, mood, typography, imagery, extra, language: lang },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No image returned");
      toast.success("AI cover generated");
      onGenerated(data.url);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Cover generation failed");
    } finally {
      setLoading(false);
    }
  };

  const Chip = ({ value, current, onClick }: { value: string; current: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-sm text-[0.65rem] font-display tracking-wide border transition-colors",
        current === value
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/40 text-muted-foreground hover:border-border-strong/60",
      )}
    >{value}</button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-surface border-border-strong/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Generate AI cover
          </DialogTitle>
          <DialogDescription className="font-serif italic">
            Last-resort fallback for "{title}" — design choices below shape the result.
            Each generation costs AI credits, so no covers are made automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section label="Design language">
            {STYLES.map(v => <Chip key={v} value={v} current={style} onClick={() => setStyle(v)} />)}
          </Section>
          <Section label="Palette">
            {PALETTES.map(v => <Chip key={v} value={v} current={palette} onClick={() => setPalette(v)} />)}
          </Section>
          <Section label="Mood">
            {MOODS.map(v => <Chip key={v} value={v} current={mood} onClick={() => setMood(v)} />)}
          </Section>
          <Section label="Typography">
            {TYPOS.map(v => <Chip key={v} value={v} current={typography} onClick={() => setTypography(v)} />)}
          </Section>
          <Section label="Imagery">
            {IMAGERIES.map(v => <Chip key={v} value={v} current={imagery} onClick={() => setImagery(v)} />)}
          </Section>

          <div className="space-y-2">
            <Label className="eyebrow">Extra direction (optional)</Label>
            <Textarea
              placeholder="e.g. include a single moth, no faces, gilded title…"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              className="bg-input border-border-strong/40 font-serif text-sm"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={generate}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate cover
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="text-muted-foreground">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
