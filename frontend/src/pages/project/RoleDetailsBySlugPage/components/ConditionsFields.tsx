import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { faInfoCircle, faPlus, faTrash, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
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
    name: `permissions.${subject}.${position}.conditions`
  });

  const conditionErrorMessage =
    errors?.permissions?.[subject]?.[position]?.conditions?.message ||
    errors?.permissions?.[subject]?.[position]?.conditions?.root?.message;

  return (
    <div className="mt-6 border-t border-t-mineshaft-600 bg-mineshaft-800 pt-2">
      <div className="flex w-full items-center justify-between">
        <div className="mt-2.5 flex items-center text-gray-300">
          <span>Conditions</span>
          <Tooltip
            className="max-w-sm"
            content={
              <>
                <p>
                  Conditions determine when a policy will be applied (always if no conditions are
                  present).
                </p>
                <p className="mt-3">
                  All conditions must evaluate to true for the policy to take effect.
                </p>
              </>
            }
          >
            <FontAwesomeIcon size="xs" className="ml-1 text-mineshaft-400" icon={faInfoCircle} />
          </Tooltip>
        </div>
        <Button
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          variant="outline_bg"
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
          Add Condition
        </Button>
      </div>
      <div className="mt-2 flex flex-col space-y-2">
        {Boolean(items.fields.length) &&
          items.fields.map((el, index) => {
            const condition =
              (watch(`permissions.${subject}.${position}.conditions.${index}`) as {
                lhs: string;
                rhs: string;
                operator: string;
              }) || {};
            return (
              <div
                key={el.id}
                className="flex items-start gap-2 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md"
              >
                <div className="w-1/4">
                  <Controller
                    control={control}
                    name={`permissions.${subject}.${position}.conditions.${index}.lhs`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Select
                          defaultValue={field.value}
                          {...field}
                          onValueChange={(e) => {
                            setValue(
                              `permissions.${subject}.${position}.conditions.${index}.operator`,
                              PermissionConditionOperators.$IN as never
                            );
                            field.onChange(e);
                          }}
                          position="popper"
                          className="w-full"
                        >
                          {selectOptions.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </div>
                <div className="flex w-44 items-center space-x-2">
                  <Controller
                    control={control}
                    name={`permissions.${subject}.${position}.conditions.${index}.operator`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0 flex-grow"
                      >
                        <Select
                          position="popper"
                          defaultValue={field.value}
                          {...field}
                          onValueChange={(e) => field.onChange(e)}
                          className="w-full"
                        >
                          {renderOperatorSelectItems(condition.lhs)}
                        </Select>
                      </FormControl>
                    )}
                  />
                  <div>
                    <Tooltip
                      asChild
                      content={getConditionOperatorHelperInfo(
                        condition?.operator as PermissionConditionOperators
                      )}
                      className="max-w-xs"
                    >
                      <FontAwesomeIcon icon={faInfoCircle} size="xs" className="text-bunker-400" />
                    </Tooltip>
                  </div>
                </div>
                <div className="flex-grow">
                  <Controller
                    control={control}
                    name={`permissions.${subject}.${position}.conditions.${index}.rhs`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0 flex-grow"
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="remove"
                  variant="outline_bg"
                  className="p-2.5"
                  onClick={() => items.remove(index)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            );
          })}
      </div>
      {conditionErrorMessage && (
        <div className="flex items-center space-x-2 py-2 text-sm text-gray-400">
          <FontAwesomeIcon icon={faWarning} className="text-red" />
          <span>{conditionErrorMessage}</span>
        </div>
      )}
    </div>
  );
};
