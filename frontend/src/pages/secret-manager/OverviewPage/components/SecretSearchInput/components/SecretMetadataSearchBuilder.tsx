import { BracesIcon, InfoIcon, PlusIcon, XIcon, ZapIcon } from "lucide-react";

import {
  Button,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SecretMetadataSearchOperator } from "@app/hooks/api/dashboard/types";

export type MetadataSearchCondition = {
  id: string;
  key: string;
  value: string;
  // Only "is" exists today; rendered as the static "is" separator between key and value.
  operator: SecretMetadataSearchOperator;
};

export type MetadataMatchType = "all" | "any";

type Props = {
  conditions: MetadataSearchCondition[];
  match: MetadataMatchType;
  matchingCount: number;
  isPending: boolean;
  hasActiveConditions: boolean;
  onChangeMatch: (match: MetadataMatchType) => void;
  onAddCondition: () => void;
  onUpdateCondition: (
    id: string,
    patch: Partial<Pick<MetadataSearchCondition, "key" | "value">>
  ) => void;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export const SecretMetadataSearchBuilder = ({
  conditions,
  match,
  matchingCount,
  isPending,
  hasActiveConditions,
  onChangeMatch,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
  onClear,
  onClose
}: Props) => {
  return (
    <div className="mb-5 rounded-lg border border-border bg-popover">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <BracesIcon className="size-4 text-muted" />
        <span className="font-medium">Filter by metadata</span>
        <IconButton
          variant="ghost"
          size="xs"
          className="ml-auto"
          aria-label="Close metadata filter"
          onClick={onClose}
        >
          <XIcon />
        </IconButton>
      </div>

      <div className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>Match</span>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["all", "any"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChangeMatch(option)}
                className={cn(
                  "h-6 rounded px-3 text-xs font-semibold tracking-wide transition-colors",
                  match === option
                    ? "bg-project/15 text-project"
                    : "text-muted hover:text-foreground"
                )}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <span>of the conditions below</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-muted">
                <InfoIcon className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <span className="font-semibold text-project">ALL</span> returns secrets matching every
              condition (AND). <span className="font-semibold text-project">ANY</span> returns
              secrets matching at least one condition (OR).
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mb-3 flex flex-col gap-2.5">
          {conditions.map((condition) => (
            <div key={condition.id} className="flex items-center gap-2.5">
              <InputGroup className="w-52 flex-none">
                <InputGroupAddon>
                  <InputGroupText className="font-mono">#</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  className="font-mono"
                  placeholder="Key"
                  value={condition.key}
                  onChange={(e) => onUpdateCondition(condition.id, { key: e.target.value })}
                />
              </InputGroup>
              <span className="flex h-9 flex-none items-center rounded-md border border-border px-3 font-mono text-sm text-muted">
                is
              </span>
              <InputGroup className="flex-1">
                <InputGroupInput
                  className="font-mono"
                  placeholder="Value"
                  value={condition.value}
                  onChange={(e) => onUpdateCondition(condition.id, { value: e.target.value })}
                />
              </InputGroup>
              <IconButton
                variant="ghost"
                size="sm"
                className="flex-none text-muted hover:text-danger"
                aria-label="Remove condition"
                onClick={() => onRemoveCondition(condition.id)}
              >
                <XIcon />
              </IconButton>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onAddCondition}>
          <PlusIcon />
          Add condition
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted">
          <ZapIcon className="size-3.5 text-project" />
          {hasActiveConditions ? (
            <span>
              <span className="font-semibold text-foreground">
                {isPending ? "…" : matchingCount}
              </span>{" "}
              matching {matchingCount === 1 && !isPending ? "secret" : "secrets"}
            </span>
          ) : (
            <span>Add a condition to search</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
};
