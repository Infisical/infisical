import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { AlertTriangleIcon, InfoIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import {
  ConditionalProjectPermissionSubject,
  PermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";

import {
  getConditionOperatorHelperInfo,
  renderOperatorSelectItems
} from "./PermissionConditionHelpers";
import { TFormSchema } from "./ProjectRoleModifySection.utils";

type ActionConditionsMap = Partial<Record<string, string[]>>;
type ActionLabelsMap = Record<string, string>;

type ConditionSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type ConditionsFieldsProps = {
  isDisabled: boolean | undefined;
  subject: ConditionalProjectPermissionSubject;
  position: number;
  selectOptions: [ConditionSelectOption, ...ConditionSelectOption[]];
  selectedActions?: string[];
  actionConditionsMap?: ActionConditionsMap;
  actionLabelsMap?: ActionLabelsMap;
};

const computeAllowedConditions = (
  selectedActions: string[] | undefined,
  actionConditionsMap: ActionConditionsMap | undefined,
  allConditions: string[]
): string[] => {
  if (!selectedActions || selectedActions.length === 0 || !actionConditionsMap) {
    return allConditions;
  }

  const actionsWithRestrictions = selectedActions.filter(
    (action) => actionConditionsMap[action] !== undefined
  );

  if (actionsWithRestrictions.length === 0) {
    return allConditions;
  }

  // Return intersection of all allowed conditions for actions with restrictions
  // Using null as sentinel to distinguish "not yet initialized" from "empty intersection"
  const result = actionsWithRestrictions.reduce<string[] | null>((acc, action) => {
    const allowed = actionConditionsMap[action];
    if (!allowed) return acc;
    if (acc === null) return allowed;
    return acc.filter((cond) => allowed.includes(cond));
  }, null);

  return result ?? allConditions;
};

const getDisallowingActions = (
  conditionValue: string,
  selectedActions: string[] | undefined,
  actionConditionsMap: ActionConditionsMap | undefined
): string[] => {
  if (!selectedActions || !actionConditionsMap) return [];

  return selectedActions.filter((action) => {
    const allowed = actionConditionsMap[action];
    return allowed !== undefined && !allowed.includes(conditionValue);
  });
};

export const ConditionsFields = ({
  isDisabled,
  subject,
  position,
  selectOptions,
  selectedActions,
  actionConditionsMap,
  actionLabelsMap
}: ConditionsFieldsProps) => {
  const { control, setValue, clearErrors, setError } = useFormContext<TFormSchema>();
  const items = useFieldArray({
    control,
    name: `permissions.${subject}.${position}.conditions` as const
  });

  const allConditionValues = useMemo(() => selectOptions.map((opt) => opt.value), [selectOptions]);

  const allowedConditions = useMemo(
    () => computeAllowedConditions(selectedActions, actionConditionsMap, allConditionValues),
    [selectedActions, actionConditionsMap, allConditionValues]
  );

  const watchedConditions = useWatch({
    control,
    name: `permissions.${subject}.${position}.conditions` as const
  });

  useEffect(() => {
    const conditions = watchedConditions as Array<{ lhs: string }> | undefined;
    if (!conditions || conditions.length === 0) return;
    if (!actionConditionsMap || !actionLabelsMap) return;

    conditions.forEach((condition: { lhs: string }, index: number) => {
      const conditionKey = condition?.lhs;
      if (!conditionKey) return;

      const disallowingActions = getDisallowingActions(
        conditionKey,
        selectedActions,
        actionConditionsMap
      );

      const fieldPath = `permissions.${subject}.${position}.conditions.${index}.lhs` as const;

      if (disallowingActions.length === 0) {
        clearErrors(fieldPath);
      } else {
        const actionNames = disallowingActions
          .map((action) => actionLabelsMap[action] || action)
          .join(", ");
        setError(fieldPath, {
          type: "custom",
          message: `This condition is not available for the actions: ${actionNames}.`
        });
      }
    });
  }, [
    selectedActions,
    watchedConditions,
    actionConditionsMap,
    actionLabelsMap,
    subject,
    position,
    clearErrors,
    setError
  ]);

  const usedConditionTypes = useMemo((): string[] => {
    const conditions = watchedConditions as Array<{ lhs: string }> | undefined;
    if (!conditions) return [];
    return conditions.map((c) => c.lhs).filter(Boolean);
  }, [watchedConditions]);

  const canAddCondition = useMemo(() => {
    const availableToAdd = selectOptions.filter(
      ({ value }) => allowedConditions.includes(value) && !usedConditionTypes.includes(value)
    );
    return availableToAdd.length > 0;
  }, [selectOptions, allowedConditions, usedConditionTypes]);

  const incompatibleConditions = useMemo(() => {
    const conditions = watchedConditions as Array<{ lhs: string }> | undefined;
    if (!conditions || conditions.length === 0) return [];
    if (!actionConditionsMap || !actionLabelsMap) return [];

    const incompatible: Array<{
      conditionLabel: string;
      conditionValue: string;
      disallowingActionLabels: string;
    }> = [];

    conditions.forEach((condition: { lhs: string }) => {
      const conditionKey = condition?.lhs;
      if (!conditionKey) return;

      const disallowingActions = getDisallowingActions(
        conditionKey,
        selectedActions,
        actionConditionsMap
      );

      if (disallowingActions.length > 0) {
        const conditionOption = selectOptions.find((opt) => opt.value === conditionKey);
        const conditionLabel = conditionOption?.label || conditionKey;
        const actionNames = disallowingActions
          .map((action) => actionLabelsMap[action] || action)
          .join(", ");

        incompatible.push({
          conditionLabel,
          conditionValue: conditionKey,
          disallowingActionLabels: actionNames
        });
      }
    });

    return incompatible;
  }, [watchedConditions, selectedActions, actionConditionsMap, actionLabelsMap, selectOptions]);

  const getDefaultOperator = (conditionType: string): PermissionConditionOperators => {
    switch (conditionType) {
      case "secretTags":
        return PermissionConditionOperators.$IN;
      default:
        return PermissionConditionOperators.$EQ;
    }
  };

  const getFirstAvailableCondition = () => {
    const available = selectOptions.find(
      ({ value }) => allowedConditions.includes(value) && !usedConditionTypes.includes(value)
    );
    const conditionType = available?.value || selectOptions[0].value;
    return {
      lhs: conditionType,
      operator: getDefaultOperator(conditionType)
    };
  };

  if (isDisabled && items.fields.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-t-border bg-card pt-2">
      <div className="flex w-full items-center justify-between">
        <div className="mt-2.5 flex items-center text-foreground">
          <span>Conditions</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="ml-1 size-4 text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm text-wrap">
              <p>
                Conditions determine when a policy will be applied (always if no conditions are
                present).
              </p>
              <p className="mt-3">
                All conditions must evaluate to true for the policy to take effect.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-2"
                isDisabled={isDisabled || !canAddCondition}
                onClick={() => {
                  const { lhs, operator } = getFirstAvailableCondition();
                  items.append({
                    lhs,
                    operator,
                    rhs: ""
                  });
                }}
              >
                <PlusIcon className="size-4" />
                Add Condition
              </Button>
            </span>
          </TooltipTrigger>
          {!canAddCondition && !isDisabled && (
            <TooltipContent side="top">
              {allowedConditions.length === 0
                ? "No conditions available for the selected group of actions."
                : "All available conditions have been added"}
            </TooltipContent>
          )}
        </Tooltip>
      </div>
      {incompatibleConditions.length > 0 && (
        <UnstableAccordion type="single" collapsible className="mt-3 border-danger/35">
          <UnstableAccordionItem value="errors" className="border-none">
            <UnstableAccordionTrigger className="min-h-10 flex-row-reverse justify-between bg-danger/[0.075] px-3 py-2 text-foreground hover:bg-danger/10 data-[state=open]:bg-danger/10 [&>svg]:shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="size-4 text-danger" />
                <span>
                  {incompatibleConditions.length} condition
                  {incompatibleConditions.length > 1 ? "s" : ""} incompatible with selected actions
                </span>
              </div>
            </UnstableAccordionTrigger>
            <UnstableAccordionContent className="space-y-1 bg-danger/[0.025] px-3 py-2">
              {incompatibleConditions.map((item) => (
                <div key={item.conditionValue} className="text-sm">
                  <span className="font-medium text-danger">
                    {item.conditionLabel} not available for the actions:
                  </span>{" "}
                  <span className="">{item.disallowingActionLabels}</span>
                </div>
              ))}

              <span className="text-sm text-accent">
                Remove the incompatible conditions or update the selected actions to make them
                compatible.
              </span>
            </UnstableAccordionContent>
          </UnstableAccordionItem>
        </UnstableAccordion>
      )}
      <div className="mt-2 flex flex-col space-y-2">
        {items.fields.length > 0 &&
          items.fields.map((el, index) => {
            const conditions = watchedConditions as
              | Array<{ lhs: string; rhs: string; operator: string }>
              | undefined;
            const condition = conditions?.[index] || { lhs: "", rhs: "", operator: "" };

            // Filter out already used conditions (except current row's condition)
            const availableOptionsForRow = selectOptions.filter(
              ({ value }) => !usedConditionTypes.includes(value) || value === condition.lhs
            );

            return (
              <Controller
                key={el.id}
                control={control}
                name={`permissions.${subject}.${position}.conditions.${index}.rhs` as const}
                render={({ field: rhsField, fieldState: { error: rhsError } }) => (
                  <Controller
                    control={control}
                    name={`permissions.${subject}.${position}.conditions.${index}.lhs` as const}
                    render={({ field: lhsField, fieldState: { error: lhsError } }) => (
                      <div className="bg-card first:rounded-t-md last:rounded-b-md">
                        <div className="flex items-center gap-2">
                          <div className="flex w-1/4 items-center gap-2">
                            {index > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="shrink-0">
                                    <Badge variant="neutral" className="text-xs">
                                      and
                                    </Badge>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-wrap">
                                  All conditions must be true for this policy to apply
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Select
                              value={lhsField.value}
                              onValueChange={(newConditionType) => {
                                setValue(
                                  `permissions.${subject}.${position}.conditions.${index}.operator` as const,
                                  getDefaultOperator(newConditionType) as never
                                );
                                lhsField.onChange(newConditionType);
                              }}
                            >
                              <SelectTrigger
                                className={twMerge(
                                  "w-full",
                                  lhsError?.message && "border-danger/25"
                                )}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper">
                                {availableOptionsForRow.map(({ value, label }) => {
                                  const isAllowed = allowedConditions.includes(value);
                                  const disallowingActions = getDisallowingActions(
                                    value,
                                    selectedActions,
                                    actionConditionsMap
                                  );

                                  if (!isAllowed) {
                                    return (
                                      <Tooltip key={value}>
                                        <TooltipTrigger asChild>
                                          <div>
                                            <SelectItem
                                              value={value}
                                              disabled
                                              className={twMerge("cursor-not-allowed opacity-50")}
                                            >
                                              {label}
                                            </SelectItem>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-xs">
                                          This condition is not available for the actions:{" "}
                                          {disallowingActions
                                            .map((action) => actionLabelsMap?.[action] || action)
                                            .join(", ")}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  }

                                  return (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {selectOptions.find((opt) => opt.value === condition.lhs)
                              ?.description && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <InfoIcon className="size-4 shrink-0 text-muted" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-wrap">
                                  {
                                    selectOptions.find((opt) => opt.value === condition.lhs)
                                      ?.description
                                  }
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex w-44 items-center space-x-2">
                            <Controller
                              control={control}
                              name={
                                `permissions.${subject}.${position}.conditions.${index}.operator` as const
                              }
                              render={({ field }) => (
                                <Select
                                  key={`${condition.lhs}-operator`}
                                  value={field.value}
                                  onValueChange={(e) => field.onChange(e)}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent position="popper">
                                    {renderOperatorSelectItems(condition.lhs, subject)}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            <div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <InfoIcon className="size-4 text-muted" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-wrap">
                                  {getConditionOperatorHelperInfo(
                                    condition?.operator as PermissionConditionOperators
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          <div className="grow">
                            <UnstableInput
                              {...rhsField}
                              className={twMerge(rhsError?.message && "border-danger/25")}
                            />
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <UnstableIconButton
                                aria-label="remove"
                                variant="outline"
                                className="hover:border-danger/30 hover:bg-danger/15"
                                isDisabled={isDisabled}
                                onClick={() => items.remove(index)}
                              >
                                <TrashIcon className="size-4" />
                              </UnstableIconButton>
                            </TooltipTrigger>
                            <TooltipContent side="right">Remove Condition</TooltipContent>
                          </Tooltip>
                        </div>
                        {rhsError?.message && (
                          <div className="flex items-start gap-2 pb-1">
                            <div className="w-1/4" />
                            <div className="w-44" />
                            <div className="grow">
                              <FieldError>{rhsError.message}</FieldError>
                            </div>
                            <div className="w-10" />
                          </div>
                        )}
                      </div>
                    )}
                  />
                )}
              />
            );
          })}
      </div>
    </div>
  );
};
