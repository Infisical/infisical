import { BracesIcon, XIcon } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { MetadataMatchType, MetadataSearchCondition } from "./SecretMetadataSearchBuilder";

type Props = {
  conditions: MetadataSearchCondition[];
  match: MetadataMatchType;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
};

export const SecretMetadataFilterChips = ({
  conditions,
  match,
  onRemoveCondition,
  onClear
}: Props) => {
  if (!conditions.length) return null;

  const connector = match === "all" ? "AND" : "OR";

  return (
    <div className="flex items-center gap-3 pt-3.5">
      <span className="shrink-0 text-xs tracking-wide text-muted uppercase">Filters</span>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-project/40 bg-project/10 px-3 py-1.5">
        <BracesIcon className="size-3.5 shrink-0 text-muted" />
        <span className="shrink-0 text-sm text-foreground">Metadata</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {conditions.map((condition, index) => (
            <div key={condition.id} className="flex items-center gap-2">
              {index > 0 && (
                <span className="rounded bg-neutral/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted">
                  {connector}
                </span>
              )}
              <span className="flex items-center gap-1.5 font-mono text-sm">
                <span className="text-foreground">{condition.key}</span>
                <span className="text-muted">=</span>
                <span className="font-semibold text-project">{condition.value}</span>
                <button
                  type="button"
                  aria-label="Remove condition"
                  className="text-muted transition-colors hover:text-foreground"
                  onClick={() => onRemoveCondition(condition.id)}
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            </div>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              className="ml-1 shrink-0"
              aria-label="Clear all metadata filters"
              onClick={onClear}
            >
              <XIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Clear all filters</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
