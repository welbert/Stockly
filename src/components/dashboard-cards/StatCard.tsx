import { Card } from "../Card";

interface StatCardProps {
  label: string;
  value: string;
  tone?: "warning" | "danger";
  /** Small line under the value (e.g. "+12% vs. mês anterior"). */
  sub?: string;
}

/** Shared shape behind every plain-number card (mockup's `.stat-card`) —
 * label on top, big value below. Kept as one component instead of repeating
 * this JSX per card, since ~10 catalog entries are otherwise identical. */
export function StatCard({ label, value, tone, sub }: StatCardProps) {
  return (
    <Card className="flex h-full flex-col">
      {/* Card's own body div isn't itself a flex container, so centering
          classes on <Card> only affect its outer wrapper, not this content —
          this inner div is what actually centers label/value/sub, both ways. */}
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="text-xs font-semibold text-theme-3">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-theme-1"}`}>
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-theme-3">{sub}</div>}
      </div>
    </Card>
  );
}
