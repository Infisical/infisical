import { BracesIcon, XIcon } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { MetadataMatchType, MetadataSearchCondition } from "./SecretMetadataSearchBuilder";

type Props = {
  conditions: MetadataSearchCondition[];
  match: MetadataMatchType;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
};

const MAX_VISIBLE_CONDITIONS = 3;

const ConditionChip = ({
  condition,
  onRemoveCondition
}: {
  condition: MetadataSearchCondition;
  onRemoveCondition: (id: string) => void;
}) => (
  <span className="flex min-w-0 items-center gap-1.5 font-mono text-sm">
    <span className="shrink-0 text-muted">{condition.key}</span>
    <span className="shrink-0 text-muted">=</span>
    <span className="max-w-40 truncate text-foreground" title={condition.value}>
      {condition.value}
    </span>
    <button
      type="button"
      aria-label="Remove condition"
      className="shrink-0 text-muted transition-colors hover:text-foreground"
      onClick={() => onRemoveCondition(condition.id)}
    >
      <XIcon className="size-3" />
    </button>
  </span>
);

const Connector = ({ connector }: { connector: string }) => (
  <span className="shrink-0 rounded bg-neutral/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
    {connector}
  </span>
);

export const SecretMetadataFilterChips = ({
  conditions,
  match,
  onRemoveCondition,
  onClear
}: Props) => {
  if (!conditions.length) return null;

  const connector = match === "all" ? "AND" : "OR";

  const visibleConditions = conditions.slice(0, MAX_VISIBLE_CONDITIONS);
  const overflowConditions = conditions.slice(MAX_VISIBLE_CONDITIONS);

  return (
    <div className="flex items-center gap-3 pt-3.5">
      <span className="shrink-0 text-xs tracking-wide text-muted uppercase">Filters</span>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-container px-3 py-1.5">
        <BracesIcon className="size-3.5 shrink-0 text-muted" />
        <span className="shrink-0 text-sm text-foreground">Metadata</span>
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          {visibleConditions.map((condition, index) => (
            <div key={condition.id} className="flex min-w-0 items-center gap-2">
              {index > 0 && <Connector connector={connector} />}
              <ConditionChip condition={condition} onRemoveCondition={onRemoveCondition} />
            </div>
          ))}
          {overflowConditions.length > 0 && (
            <HoverCard openDelay={150} closeDelay={150}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  aria-label={`Show ${overflowConditions.length} more metadata filters`}
                  className="shrink-0 rounded bg-neutral/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted transition-colors hover:bg-neutral/25 hover:text-foreground"
                >
                  {`+${overflowConditions.length}`}
                </button>
              </HoverCardTrigger>
              <HoverCardContent align="end" className="flex w-auto max-w-sm flex-col gap-1.5 p-2">
                {overflowConditions.map((condition) => (
                  <div key={condition.id} className="flex min-w-0 items-center gap-2">
                    <Connector connector={connector} />
                    <ConditionChip condition={condition} onRemoveCondition={onRemoveCondition} />
                  </div>
                ))}
              </HoverCardContent>
            </HoverCard>
          )}
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
