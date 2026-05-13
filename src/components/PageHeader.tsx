import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAdminSettings, type PageKey } from "@/lib/adminSettings";
import { useLang } from "@/lib/i18n";

interface Props {
  eyebrow?: string;
  title: ReactNode;
  titleMain?: string;
  titleEmphasis?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}

export function PageHeader({ eyebrow, title, titleMain, titleEmphasis, subtitle, right }: Props) {
  const { pathname } = useLocation();
  const { settings } = useAdminSettings();
  const { t } = useLang();
  const copy = settings.pages[pathname as PageKey];

  const tx = (s?: string) => (s ? t(s, s) : s);

  const renderedEyebrow = tx(copy?.eyebrow ?? eyebrow);
  const main = copy?.title ?? titleMain;
  const emph = copy?.emphasis ?? titleEmphasis;
  const renderedTitle = main || emph ? (
    <>
      {tx(main)}{main && emph ? " " : ""}
      {emph && <em className="font-display italic text-primary/90">{tx(emph)}</em>}
    </>
  ) : (
    typeof title === "string" ? tx(title) : title
  );
  const renderedSubtitle = typeof (copy?.subtitle ?? subtitle) === "string"
    ? tx((copy?.subtitle ?? subtitle) as string)
    : (copy?.subtitle ?? subtitle);

  return (
    <header className="relative px-4 sm:px-8 lg:px-14 pt-12 pb-8 border-b border-border/60 overflow-hidden">
      <div className="parallax-y absolute -top-24 -right-16 w-[420px] h-[420px] rounded-full pointer-events-none opacity-[0.18]"
           data-speed="0.08"
           style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.55), transparent 65%)" }} />
      <div className="relative flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          {renderedEyebrow && (
            <div className="reveal-rise flex items-center gap-3 mb-3" data-stagger="60" data-index="0">
              <span className="h-px w-8 bg-primary/60" />
              <span className="eyebrow">{renderedEyebrow}</span>
            </div>
          )}
          <h1 className="reveal-book reveal-rule font-display text-5xl md:text-7xl text-foreground leading-[0.92] tracking-tight">
            {renderedTitle}
          </h1>
          {renderedSubtitle && (
            <p className="reveal-rise mt-5 font-serif italic text-lg text-muted-foreground max-w-xl" data-stagger="80" data-index="2">
              {renderedSubtitle}
            </p>
          )}
        </div>
        {right && <div className="reveal-rise shrink-0" data-index="1" data-stagger="80">{right}</div>}
      </div>
      <div className="reveal-rise gold-rule mt-8" data-index="3" data-stagger="80" />
    </header>
  );
}
