/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { InfoIcon, Loader2Icon, TrashIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { projectKeys, useEnableSecretBlindIndex } from "@app/hooks/api/projects";
import { secretInsightsKeys, useGetSecretBlindIndexStatus } from "@app/hooks/api/secretInsights";

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
  projectId: string;
  isBlindIndexEnabled: boolean;
  onRemove: () => void;
};

const UniqueSecretValueCard = ({ index, projectId, isBlindIndexEnabled, onRemove }: Props) => {
  const { control, watch } = useFormContext<TRuleForm>();
  const queryClient = useQueryClient();
  const constraintType = watch(`enforcement.constraints.${index}.type`);
  const constraintOption = CONSTRAINT_OPTIONS.find((o) => o.type === constraintType);
  const Icon = constraintOption?.icon;

  const secretVersionsEnabled = watch(
    `enforcement.constraints.${index}.value.secretVersions.enabled` as `enforcement.constraints.${number}.value`
  ) as unknown as boolean;

  const [migrationTriggered, setMigrationTriggered] = useState(false);
  const enableBlindIndex = useEnableSecretBlindIndex();

  const { data: statusData } = useGetSecretBlindIndexStatus(
    { projectId },
    {
      enabled: migrationTriggered,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed" || status === "not-found") return false;
        return 2000;
      }
    }
  );

  useEffect(() => {
    if (statusData?.status === "completed" && migrationTriggered) {
      setMigrationTriggered(false);
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectById(projectId)
      });
    }
  }, [statusData?.status, migrationTriggered, projectId, queryClient]);

  const handleEnableBlindIndex = () => {
    setMigrationTriggered(true);
    enableBlindIndex.mutate(
      { projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: secretInsightsKeys.blindIndexStatus({ projectId })
          });
        },
        onError: () => {
          setMigrationTriggered(false);
          createNotification({
            text: "Failed to enable blind indexing",
            type: "error"
          });
        }
      }
    );
  };

  const isMigrationRunning =
    migrationTriggered && statusData?.status !== "failed" && statusData?.status !== "completed";

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

      <div className="mt-3 flex flex-col gap-3">
        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                This secret&apos;s previous versions
              </p>
              <p className="text-xs text-muted">Reject values this secret held before</p>
            </div>
            <Controller
              control={control}
              name={
                `enforcement.constraints.${index}.value.secretVersions.enabled` as `enforcement.constraints.${number}.value`
              }
              render={({ field: { value, onChange } }) => (
                <Switch
                  variant="project"
                  checked={value as unknown as boolean}
                  onCheckedChange={onChange}
                />
              )}
            />
          </div>

          {secretVersionsEnabled && (
            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs text-muted">
                Versions to check
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="size-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent side="left" align="start" className="max-w-xs">
                    <p className="text-sm">
                      When a secret is updated, its new value is validated against the specified
                      number of prior versions.
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Maximum: {MAX_PREVENT_VALUE_REUSE_VERSIONS} versions
                    </p>
                  </TooltipContent>
                </Tooltip>
              </label>
              <Controller
                control={control}
                name={
                  `enforcement.constraints.${index}.value.secretVersions.versions` as `enforcement.constraints.${number}.value`
                }
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <div>
                    <Input
                      value={value as unknown as number}
                      onChange={(e) => onChange(Number(e.target.value))}
                      type="number"
                      min={1}
                      max={MAX_PREVENT_VALUE_REUSE_VERSIONS}
                      className="w-24"
                      isError={Boolean(error)}
                    />
                    {error?.message && <p className="mt-1 text-xs text-danger">{error.message}</p>}
                  </div>
                )}
              />
            </div>
          )}
        </div>

        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Other secrets in scope</p>
              <p className="text-xs text-muted">
                Reject values currently used by other secrets in this rule&apos;s scope
              </p>
            </div>
            <Controller
              control={control}
              name={
                `enforcement.constraints.${index}.value.otherSecrets.enabled` as `enforcement.constraints.${number}.value`
              }
              render={({ field: { value, onChange } }) => (
                <Switch
                  variant="project"
                  checked={value as unknown as boolean}
                  onCheckedChange={(checked) => {
                    if (checked && !isBlindIndexEnabled) return;
                    onChange(checked);
                  }}
                  disabled={!isBlindIndexEnabled && !(value as unknown as boolean)}
                />
              )}
            />
          </div>

          {!isBlindIndexEnabled && (
            <div className="mt-3">
              <Alert variant="warning" className="py-3">
                <TriangleAlertIcon className="size-4" />
                <AlertTitle>Blind indexing required</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">
                    Cross-secret duplicate detection requires blind indexing to be enabled for this
                    project.
                  </p>
                  {isMigrationRunning ? (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2Icon className="size-4 animate-spin" />
                      Enabling blind indexing...
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleEnableBlindIndex}
                      isDisabled={enableBlindIndex.isPending}
                    >
                      Enable Blind Indexing
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ConstraintCard = ({ index, projectId, isBlindIndexEnabled, onRemove }: Props) => {
  const { control, watch } = useFormContext<TRuleForm>();
  const constraintType = watch(`enforcement.constraints.${index}.type`);
  const allConstraints = watch("enforcement.constraints");
  const ruleType = watch("enforcement.type");
  const isGeneratedCredentialRule =
    ruleType === RuleType.DynamicSecrets || ruleType === RuleType.SecretRotations;

  if (constraintType === ConstraintType.UniqueSecretValue) {
    return (
      <UniqueSecretValueCard
        index={index}
        projectId={projectId}
        isBlindIndexEnabled={isBlindIndexEnabled}
        onRemove={onRemove}
      />
    );
  }

  const constraintOption = CONSTRAINT_OPTIONS.find((o) => o.type === constraintType);

  const otherTargets = new Set(
    allConstraints
      ?.filter((c, i) => i !== index && c.type === constraintType)
      .map((c) => c.appliesTo)
  );

  const Icon = constraintOption?.icon;
  const placeholder = constraintOption?.placeholder;
  const isNumericInput =
    constraintType === ConstraintType.MinLength || constraintType === ConstraintType.MaxLength;

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
        {(() => {
          if (isGeneratedCredentialRule) {
            return (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Applies to</label>
                <Input value="Generated Password" readOnly className="cursor-default opacity-60" />
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Applies to</label>
              <Controller
                control={control}
                name={`enforcement.constraints.${index}.appliesTo`}
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
          );
        })()}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">
            {CONSTRAINT_VALUE_LABELS[constraintType]}
          </label>
          <Controller
            control={control}
            name={`enforcement.constraints.${index}.value`}
            render={({ field, fieldState: { error } }) => (
              <div>
                <Input
                  {...field}
                  value={field.value as string}
                  type={isNumericInput ? "number" : "text"}
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
