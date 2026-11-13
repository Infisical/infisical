import { Controller, useFormContext } from "react-hook-form";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import { BlindIndexAlert } from "./blind-index-alert";
import {
  CONSTRAINT_OPTIONS,
  ConstraintTarget,
  ConstraintType,
  MAX_PREVENT_VALUE_REUSE_VERSIONS,
  RuleType,
  TARGET_LABELS,
  type TRuleForm
} from "./validation-rules.utils";

import styles from "./policies.module.css";

export const ConstraintCard = ({
  index,
  onRemove,
  projectId,
  blindIndexEnabled,
  canEnableBlindIndex
}: {
  index: number;
  onRemove: () => void;
  projectId: string;
  blindIndexEnabled: boolean;
  canEnableBlindIndex: boolean;
}) => {
  const { control, watch } = useFormContext<TRuleForm>();
  const constraintType = watch(`enforcement.constraints.${index}.type`);
  const allConstraints = watch("enforcement.constraints");
  const ruleType = watch("enforcement.type");
  const checkOtherSecretsInScope = watch(
    `enforcement.constraints.${index}.checkOtherSecretsInScope`
  );
  const isGeneratedCredentialRule = ruleType !== RuleType.StaticSecrets;
  const option = CONSTRAINT_OPTIONS.find((entry) => entry.type === constraintType);
  const otherTargets = new Set(
    allConstraints
      ?.filter((entry, i) => i !== index && entry.type === constraintType)
      .map((entry) => entry.appliesTo)
  );
  const isNumeric =
    constraintType === ConstraintType.MinLength || constraintType === ConstraintType.MaxLength;

  return (
    <Card
      title={option?.label}
      description={option?.cardDescription}
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          icon="trash"
          iconOnly
          onClick={onRemove}
        >
          Remove constraint
        </Button>
      }
    >
      {constraintType === ConstraintType.PreventValueReuse ? (
        <Stack gap={16}>
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.checkOtherSecretsInScope`}
            render={({ field: { value, onChange } }) => (
              <Switch
                layout="row"
                label="Other secrets in scope"
                description="Reject values currently used by other secrets in this rule's scope."
                checked={Boolean(value)}
                onCheckedChange={onChange}
              />
            )}
          />
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.checkPreviousVersions`}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Stack gap={16}>
                <Field error={error?.message} wide>
                  <Switch
                    layout="row"
                    label="This secret's previous versions"
                    description="Reject values this secret held before."
                    checked={Boolean(value)}
                    onCheckedChange={onChange}
                  />
                </Field>
                {value && (
                  <Controller
                    control={control}
                    name={`enforcement.constraints.${index}.value`}
                    render={({ field, fieldState: { error: valueError } }) => (
                      <Field
                        label={option?.valueLabel}
                        description={`How many previous versions the new value must differ from, up to ${MAX_PREVENT_VALUE_REUSE_VERSIONS}.`}
                        error={valueError?.message}
                      >
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          max={MAX_PREVENT_VALUE_REUSE_VERSIONS}
                          placeholder={option?.placeholder}
                          invalid={Boolean(valueError)}
                        />
                      </Field>
                    )}
                  />
                )}
              </Stack>
            )}
          />
          {checkOtherSecretsInScope && (
            <BlindIndexAlert
              projectId={projectId}
              isEnabled={blindIndexEnabled}
              canEnable={canEnableBlindIndex}
            />
          )}
        </Stack>
      ) : (
        <div className={styles.constraintFields}>
          {isGeneratedCredentialRule ? (
            <Field label="Applies to" wide>
              <Input value={TARGET_LABELS[ConstraintTarget.GeneratedPassword]} readOnly />
            </Field>
          ) : (
            <Controller
              control={control}
              name={`enforcement.constraints.${index}.appliesTo`}
              render={({ field: { value, onChange } }) => (
                <Field label="Applies to" wide>
                  <Select
                    label="Applies to"
                    value={value}
                    onChange={onChange}
                    options={[ConstraintTarget.SecretKey, ConstraintTarget.SecretValue].map(
                      (target) => ({
                        value: target,
                        label: TARGET_LABELS[target],
                        disabled: otherTargets.has(target)
                      })
                    )}
                  />
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.value`}
            render={({ field, fieldState: { error } }) => (
              <Field label={option?.valueLabel} error={error?.message} wide>
                <Input
                  {...field}
                  type={isNumeric ? "number" : "text"}
                  mono={!isNumeric}
                  placeholder={option?.placeholder}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        </div>
      )}
    </Card>
  );
};
