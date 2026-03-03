import { Fragment, useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { InfoIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import {
  ConditionalProjectPermissionSubject,
  PermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";

import {
  getConditionOperatorHelperInfo,
  getDefaultOperatorForCondition,
  renderOperatorSelectItems
} from "./PermissionConditionHelpers";
import { TFormSchema } from "./ProjectRoleModifySection.utils";

type ActionConditionsMap = Partial<Record<string, string[]>>;

type ConditionsFieldsProps = {
  isDisabled: boolean | undefined;
  subject: ConditionalProjectPermissionSubject;
  position: number;
  selectOptions: [{ value: string; label: string }, ...{ value: string; label: string }[]];
  selectedActions?: string[];
  actionConditionsMap?: ActionConditionsMap;
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
  return actionsWithRestrictions.reduce<string[]>((acc, action) => {
    const allowed = actionConditionsMap[action];
    if (!allowed) return acc;
    if (acc.length === 0) return allowed;
    return acc.filter((cond) => allowed.includes(cond));
  }, []);
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
  actionConditionsMap
}: ConditionsFieldsProps) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors }
  } = useFormContext<TFormSchema>();
  const items = useFieldArray({
    control,
    name: `permissions.${subject}.${position}.conditions` as const
  });

  const allConditionValues = useMemo(() => selectOptions.map((opt) => opt.value), [selectOptions]);

  const allowedConditions = useMemo(
    () => computeAllowedConditions(selectedActions, actionConditionsMap, allConditionValues),
    [selectedActions, actionConditionsMap, allConditionValues]
  );

  const usedConditionTypes = useMemo(() => {
    return items.fields.map((_, i) => {
      const lhs = watch(`permissions.${subject}.${position}.conditions.${i}.lhs` as const);
      return lhs;
    });
  }, [items.fields, watch, subject, position]);

  const availableConditionsToAdd = useMemo(() => {
    return selectOptions.filter(
      ({ value }) => allowedConditions.includes(value) && !usedConditionTypes.includes(value)
    );
  }, [selectOptions, allowedConditions, usedConditionTypes]);

  const canAddCondition = availableConditionsToAdd.length > 0;

  const getNewConditionDefaults = () => {
    const conditionType = availableConditionsToAdd[0]?.value || selectOptions[0].value;
    return {
      lhs: conditionType,
      operator: getDefaultOperatorForCondition(conditionType),
      rhs: ""
    };
  };

  if (isDisabled && items.fields.length === 0) {
    return null;
  }

  const conditionErrorMessage =
    (errors?.permissions as any)?.[subject]?.[position]?.conditions?.message ||
    (errors?.permissions as any)?.[subject]?.[position]?.conditions?.root?.message;

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
                onClick={() => items.append(getNewConditionDefaults())}
              >
                <PlusIcon className="size-4" />
                Add Condition
              </Button>
            </span>
          </TooltipTrigger>
          {!canAddCondition && !isDisabled && (
            <TooltipContent side="top">All available conditions have been added</TooltipContent>
          )}
        </Tooltip>
      </div>
      <div className="mt-2 flex flex-col space-y-2">
        {items.fields.length === 0 ? (
          <UnstableEmpty className="mt-2 border !p-8">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No conditions configured</UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Add conditions to control when this policy applies.
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          items.fields.map((el, index) => {
            const condition =
              (watch(`permissions.${subject}.${position}.conditions.${index}` as const) as {
                lhs: string;
                rhs: string;
                operator: string;
              }) || {};

            const availableOptionsForRow = selectOptions.filter(
              ({ value }) => !usedConditionTypes.includes(value) || value === condition.lhs
            );

            return (
              <Fragment key={el.id}>
                <div className="flex items-center gap-2 bg-card first:rounded-t-md last:rounded-b-md">
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
                    <Controller
                      control={control}
                      name={`permissions.${subject}.${position}.conditions.${index}.lhs` as const}
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error?.message)} className="mb-0 flex-1">
                          <FieldContent>
                            <Select
                              value={field.value}
                              onValueChange={(e) => {
                                setValue(
                                  `permissions.${subject}.${position}.conditions.${index}.operator` as const,
                                  PermissionConditionOperators.$IN as never
                                );
                                field.onChange(e);
                              }}
                            >
                              <SelectTrigger className="w-full">
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
                                          {disallowingActions.join(", ")}
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
                          </FieldContent>
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  </div>
                  <div className="flex w-44 items-center space-x-2">
                    <Controller
                      control={control}
                      name={
                        `permissions.${subject}.${position}.conditions.${index}.operator` as const
                      }
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error?.message)} className="mb-0 grow">
                          <FieldContent>
                            <Select value={field.value} onValueChange={(e) => field.onChange(e)}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper">
                                {renderOperatorSelectItems(condition.lhs)}
                              </SelectContent>
                            </Select>
                          </FieldContent>
                          <FieldError>{error?.message}</FieldError>
                        </Field>
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
                    <Controller
                      control={control}
                      name={`permissions.${subject}.${position}.conditions.${index}.rhs` as const}
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error?.message)} className="mb-0 grow">
                          <FieldContent>
                            <UnstableInput {...field} />
                          </FieldContent>
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  </div>
                  <UnstableIconButton
                    aria-label="remove"
                    variant="outline"
                    className="p-2.5"
                    isDisabled={isDisabled}
                    onClick={() => items.remove(index)}
                  >
                    <TrashIcon className="size-4" />
                  </UnstableIconButton>
                </div>
              </Fragment>
            );
          })
        )}
      </div>
      {conditionErrorMessage && (
        <div className="flex items-center space-x-2 py-2 text-sm text-muted">
          <TriangleAlertIcon className="text-destructive size-4" />
          <span>{conditionErrorMessage}</span>
        </div>
      )}
    </div>
  );
};
