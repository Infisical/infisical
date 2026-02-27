import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";

const STATUS_STYLES: Record<string, string> = {
  failed: "text-[#f85149] bg-[#2b0d0d]",
  active: "text-[#3fb950] bg-[#0d2b1a]",
  pending: "text-[#58a6ff] bg-[#0d1e2e]",
  expired: "text-[#d29922] bg-[#2b1f0d]"
};

export function StatusPill({ status, tooltip }: { status: string; tooltip?: string }) {
  const pill = (
    <span
      className={twMerge(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[status] ?? "bg-mineshaft-700 text-mineshaft-300"
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {status}
    </span>
  );

  if (!tooltip) return pill;

  return (
    <Tooltip content={<p className="text-[11px] leading-relaxed">{tooltip}</p>}>{pill}</Tooltip>
  );
}
