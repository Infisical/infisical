import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon, TrashIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { BlindIndexAlert } from "./BlindIndexAlert";
import {
  CONSTRAINT_OPTIONS,
  CONSTRAINT_TYPE_LABELS,
  CONSTRAINT_VALUE_LABELS,
  ConstraintTarget,
  ConstraintType,
  MAX_PREVENT_VALUE_REUSE_VERSIONS,
  RuleType,
  TRuleForm
} from "./SecretValidationRulesSection.utils";

type Props = {
  index: number;
  onRemove: () => void;
};

export const ConstraintCard = ({ index, onRemove }: Props) => {
  const { control, watch } = useFormContext<TRuleForm>();
  const constraintType = watch(`enforcement.constraints.${index}.type`);
  const allConstraints = watch("enforcement.constraints");
  const ruleType = watch("enforcement.type");
  // Generated-credential rules currently only target the generated password.
  const isGeneratedCredentialRule =
    ruleType === RuleType.DynamicSecrets || ruleType === RuleType.SecretRotations;

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
    constraintType === ConstraintType.MinLength || constraintType === ConstraintType.MaxLength;
  const checkOtherSecretsInScope = watch(
    `enforcement.constraints.${index}.checkOtherSecretsInScope`
  );

  const appliesToId = `constraint-${index}-applies-to`;
  const valueId = `constraint-${index}-value`;

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

      {isPreventValueReuse ? (
        <div className="mt-3 flex flex-col">
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.checkOtherSecretsInScope`}
            render={({ field: { value, onChange } }) => (
              <Field orientation="horizontal" className="border-t border-border pt-3">
                <FieldContent>
                  <FieldTitle>Other secrets in scope</FieldTitle>
                  <FieldDescription>
                    Reject values currently used by other secrets in this rule&apos;s scope
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  aria-label="Check the new value against other secrets in this rule's scope"
                  checked={Boolean(value)}
                  onCheckedChange={onChange}
                  variant="project"
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name={`enforcement.constraints.${index}.checkPreviousVersions`}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                <Field orientation="horizontal" data-invalid={Boolean(error)}>
                  <FieldContent>
                    <FieldTitle>This secret&apos;s previous versions</FieldTitle>
                    <FieldDescription>Reject values this secret held before</FieldDescription>
                    <FieldError errors={[error]} />
                  </FieldContent>
                  <Toggle
                    aria-label="Check the new value against this secret's previous versions"
                    checked={Boolean(value)}
                    onCheckedChange={onChange}
                    variant="project"
                  />
                </Field>
                {value && (
                  <Controller
                    control={control}
                    name={`enforcement.constraints.${index}.value`}
                    render={({ field, fieldState: { error: valueError } }) => (
                      <Field orientation="horizontal" data-invalid={Boolean(valueError)}>
                        <FieldLabel htmlFor={valueId}>
                          {CONSTRAINT_VALUE_LABELS[constraintType]}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <InfoIcon className="text-muted" />
                            </TooltipTrigger>
                            <TooltipContent side="left" align="start" className="max-w-xs">
                              <p className="text-sm">
                                How many of the secret&apos;s own previous versions the new value
                                must differ from.
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                Maximum: {MAX_PREVENT_VALUE_REUSE_VERSIONS} versions
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                        <FieldContent className="w-24 flex-none">
                          <Input
                            {...field}
                            id={valueId}
                            type="number"
                            min={1}
                            max={MAX_PREVENT_VALUE_REUSE_VERSIONS}
                            placeholder={placeholder?.toString() || undefined}
                            isError={Boolean(valueError)}
                          />
                          <FieldError errors={[valueError]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                )}
              </div>
            )}
          />

          {checkOtherSecretsInScope && <BlindIndexAlert />}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {isGeneratedCredentialRule ? (
            <Field>
              <FieldLabel htmlFor={appliesToId}>Applies to</FieldLabel>
              <Input
                id={appliesToId}
                value="Generated Password"
                readOnly
                className="cursor-default opacity-60"
              />
            </Field>
          ) : (
            <Controller
              control={control}
              name={`enforcement.constraints.${index}.appliesTo`}
              render={({ field: { value, onChange } }) => (
                <Field>
                  <FieldLabel htmlFor={appliesToId}>Applies to</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id={appliesToId}>
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
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.value`}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor={valueId}>{CONSTRAINT_VALUE_LABELS[constraintType]}</FieldLabel>
                <Input
                  {...field}
                  id={valueId}
                  type={isNumericInput ? "number" : "text"}
                  placeholder={placeholder?.toString() || undefined}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
      )}
    </div>
  );
};
