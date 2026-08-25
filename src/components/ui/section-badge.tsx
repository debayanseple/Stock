import { cn } from "@/lib/utils";

/** Monospace pill label with pulsing accent dot — marks the start of a section. */
export function SectionBadge({
  children,
  className,
  pulse = true,
}: {
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-primary/30 bg-primary/5 px-5 py-2",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full bg-primary", pulse && "animate-pulse-dot")}
      />
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-primary">{children}</span>
    </div>
  );
}
