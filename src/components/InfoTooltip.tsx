import { Tooltip } from "./Tooltip";

interface InfoTooltipProps {
  text: string;
}

/** "?" ao lado de um label, com explicação ao passar o mouse/focar. */
export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <Tooltip text={text}>
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-theme-hover text-[9px] font-bold text-theme-3 hover:bg-primary-soft hover:text-primary"
      >
        ?
      </button>
    </Tooltip>
  );
}
