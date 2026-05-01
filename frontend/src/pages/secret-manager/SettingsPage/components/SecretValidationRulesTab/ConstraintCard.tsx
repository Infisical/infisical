/* eslint-disable jsx-a11y/label-has-associated-control */
import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon, TrashIcon } from "lucide-react";

import {
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import {
  CONSTRAINT_OPTIONS,
  CONSTRAINT_TYPE_LABELS,
  CONSTRAINT_VALUE_LABELS,
  ConstraintTarget,
  ConstraintType,
  MAX_PREVENT_VALUE_REUSE_VERSIONS,
  TRuleForm
} from "./SecretValidationRulesTab.utils";

type Props = {
  index: number;
  onRemove: () => void;
};

export const ConstraintCard = ({ index, onRemove }: Props) => {
  const { control, watch } = useFormContext<TRuleForm>();
  const constraintType = watch(`enforcement.inputs.constraints.${index}.type`);
  const allConstraints = watch("enforcement.inputs.constraints");

  const constraintOption = CONSTRAINT_OPTIONS.find((o) => o.type === constraintType);

  // Determine which targets are already used by other constraints of the same type
  const otherTargets = new Set(
    allConstraints
      ?.filter((c, i) => i !== index && c.type === constraintType)
      .map((c) => c.appliesTo)
  );

  const Icon = constraintOption?.icon;
  const placeholder = constraintOption?.placeholder;
  const isPreventValueReuse = constraintType === ConstraintType.PreventValueReuse;
  const isNumericInput =
    constraintType === ConstraintType.MinLength ||
    constraintType === ConstraintType.MaxLength ||
    constraintType === ConstraintType.PreventValueReuse;

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-muted" />}
          <span className="text-sm font-medium text-foreground">
            {CONSTRAINT_TYPE_LABELS[constraintType]}
          </span>
        </div>
        <IconButton aria-label="Remove constraint" variant="danger" size="xs" onClick={onRemove}>
          <TrashIcon className="size-3.5" />
        </IconButton>
      </div>

      {constraintOption?.cardDescription && (
        <p className="mt-1.5 text-xs text-muted">{constraintOption.cardDescription}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {isPreventValueReuse ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Applies to</label>
            <Input value="Secret Value" readOnly className="cursor-default opacity-60" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Applies to</label>
            <Controller
              control={control}
              name={`enforcement.inputs.constraints.${index}.appliesTo`}
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem
                      value={ConstraintTarget.SecretKey}
                      disabled={otherTargets.has(ConstraintTarget.SecretKey)}
                    >
                      Secret Key
                    </SelectItem>
                    <SelectItem
                      value={ConstraintTarget.SecretValue}
                      disabled={otherTargets.has(ConstraintTarget.SecretValue)}
                    >
                      Secret Value
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">
            <div className="flex items-center gap-1">
              {CONSTRAINT_VALUE_LABELS[constraintType]}
              {constraintType === ConstraintType.PreventValueReuse && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="ml-1 size-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent side="left" align="start" className="max-w-xs">
                    <p className="text-sm">
                      When a secret is updated, its new value is validated against the specified
                      number of prior versions.
                    </p>
                    <p className="mt-2 text-xs text-muted">Maximum: 25 versions</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </label>
          <Controller
            control={control}
            name={`enforcement.inputs.constraints.${index}.value`}
            render={({ field, fieldState: { error } }) => (
              <div>
                <Input
                  {...field}
                  type={isNumericInput ? "number" : "text"}
                  min={isPreventValueReuse ? 1 : undefined}
                  max={isPreventValueReuse ? MAX_PREVENT_VALUE_REUSE_VERSIONS : undefined}
                  placeholder={placeholder?.toString() || undefined}
                  isError={Boolean(error)}
                />
                {error?.message && <p className="mt-1 text-xs text-danger">{error.message}</p>}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
};
