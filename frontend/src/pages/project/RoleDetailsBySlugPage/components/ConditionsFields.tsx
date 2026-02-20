import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { InfoIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

import {
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

export const ConditionsFields = ({
  isDisabled,
  subject,
  position,
  selectOptions
}: {
  isDisabled: boolean | undefined;
  subject: ConditionalProjectPermissionSubject;
  position: number;
  selectOptions: [{ value: string; label: string }, ...{ value: string; label: string }[]];
}) => {
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

  const conditionErrorMessage =
    (errors?.permissions as any)?.[subject]?.[position]?.conditions?.message ||
    (errors?.permissions as any)?.[subject]?.[position]?.conditions?.root?.message;

  return (
    <div className="mt-6 border-t border-t-border bg-background pt-2">
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
        <Button
          variant="outline"
          size="xs"
          className="mt-2"
          isDisabled={isDisabled}
          onClick={() =>
            items.append({
              lhs: selectOptions[0].value,
              operator: PermissionConditionOperators.$EQ,
              rhs: ""
            })
          }
        >
          <PlusIcon className="size-4" />
          Add Condition
        </Button>
      </div>
      <div className="mt-2 flex flex-col space-y-2">
        {Boolean(items.fields.length) &&
          items.fields.map((el, index) => {
            const condition =
              (watch(`permissions.${subject}.${position}.conditions.${index}` as const) as {
                lhs: string;
                rhs: string;
                operator: string;
              }) || {};
            return (
              <div
                key={el.id}
                className="flex items-start gap-2 bg-background first:rounded-t-md last:rounded-b-md"
              >
                <div className="w-1/4">
                  <Controller
                    control={control}
                    name={`permissions.${subject}.${position}.conditions.${index}.lhs` as const}
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error?.message)} className="mb-0">
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
                              {selectOptions.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
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
                  onClick={() => items.remove(index)}
                >
                  <TrashIcon className="size-4" />
                </UnstableIconButton>
              </div>
            );
          })}
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
