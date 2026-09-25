import { Fragment } from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { Button, Field, FieldLabel, IconButton, Input, Separator } from "@app/components/v3";
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
  onChangeMatch: (match: MetadataMatchType) => void;
  onAddCondition: () => void;
  onUpdateCondition: (
    id: string,
    patch: Partial<Pick<MetadataSearchCondition, "key" | "value">>
  ) => void;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
};

export const SecretMetadataSearchBuilder = ({
  conditions,
  match,
  onChangeMatch,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
  onClear
}: Props) => {
  return (
    <div className="flex flex-col gap-3">
      {conditions.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-accent">
          <span>Match conditions</span>
          <div
            role="group"
            aria-label="Match metadata conditions"
            className="inline-flex rounded-md border border-border p-0.5"
          >
            {(["all", "any"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={match === option}
                aria-label={`Match ${option} conditions`}
                onClick={() => onChangeMatch(option)}
                className={cn(
                  "h-6 rounded px-2 text-xs font-medium transition-colors",
                  match === option
                    ? "bg-project/15 text-project"
                    : "text-accent hover:text-foreground"
                )}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {conditions.map((condition, index) => (
          <Fragment key={condition.id}>
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-1">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor={`metadata-key-${condition.id}`}>Key</FieldLabel>
                  <Input
                    id={`metadata-key-${condition.id}`}
                    aria-label={`Metadata key ${index + 1}`}
                    className="font-mono"
                    placeholder="e.g. owner"
                    value={condition.key}
                    onChange={(e) => onUpdateCondition(condition.id, { key: e.target.value })}
                  />
                </Field>
                <IconButton
                  variant="ghost"
                  size="sm"
                  className="mb-0.5 flex-none text-accent hover:text-danger"
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() => onRemoveCondition(condition.id)}
                >
                  <XIcon />
                </IconButton>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 shrink-0 items-center rounded-md border border-border bg-foreground/5 px-3 text-sm text-foreground">
                  is
                </span>
                <Field className="min-w-0 flex-1">
                  <FieldLabel className="sr-only" htmlFor={`metadata-value-${condition.id}`}>
                    Value
                  </FieldLabel>
                  <Input
                    id={`metadata-value-${condition.id}`}
                    aria-label={`Metadata value ${index + 1}`}
                    className="font-mono"
                    placeholder="e.g. security"
                    value={condition.value}
                    onChange={(e) => onUpdateCondition(condition.id, { value: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            {index < conditions.length - 1 && (
              <div className="flex w-full items-center gap-2">
                <Separator className="min-w-0 flex-1" />
                <span className="text-xs text-accent">{match === "all" ? "AND" : "OR"}</span>
                <Separator className="min-w-0 flex-1" />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between gap-1">
        <Button variant="neutral" size="sm" onClick={onAddCondition}>
          <PlusIcon />
          Add Condition
        </Button>
        {conditions.length > 0 && (
          <Button variant="ghost" size="xs" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
