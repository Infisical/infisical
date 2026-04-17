/* eslint-disable jsx-a11y/label-has-associated-control */
import { Controller, useFormContext } from "react-hook-form";
import { TrashIcon } from "lucide-react";

import {
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

import {
  CONSTRAINT_OPTIONS,
  CONSTRAINT_TYPE_LABELS,
  CONSTRAINT_VALUE_LABELS,
  ConstraintTarget,
  ConstraintType,
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

      <div className="mt-3 grid grid-cols-2 gap-3">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">
            {CONSTRAINT_VALUE_LABELS[constraintType]}
          </label>
          <Controller
            control={control}
            name={`enforcement.inputs.constraints.${index}.value`}
            render={({ field, fieldState: { error } }) => (
              <div>
                <Input
                  {...field}
                  type={
                    constraintType === ConstraintType.MinLength ||
                    constraintType === ConstraintType.MaxLength
                      ? "number"
                      : "text"
                  }
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
