import { ReactNode } from "react";

/** Key chip ("keycap") — same look as the mockup's `.kbd`: a background
 * slightly different from what's around it and a thicker bottom border, so
 * it reads as a physical keyboard button rather than just monospace text. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-b-2 border-theme-border bg-theme-surface px-1.5 py-0.5 font-mono text-[11px] font-medium text-theme-1">
      {children}
    </span>
  );
}
