import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { faPlus, faTrash, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { PermissionConditionOperators } from "@app/context/ProjectPermissionContext/types";

import { TFormSchema } from "../ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

const getValueLabel = (type: string) => {
  if (type === "environment") return "Environment slug";
  if (type === "secretPath") return "Folder path";
  return "";
};

export const SecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const {
    control,
    watch,
    formState: { errors }
  } = useFormContext<TFormSchema>();
  const items = useFieldArray({
    control,
    name: `permissions.secrets.${position}.conditions`
  });

  return (
    <div className="mt-6 border-t  border-t-gray-800 bg-mineshaft-800  pt-2">
      <div className="mt-2 flex flex-col space-y-2">
        {items.fields.map((el, index) => {
          const lhs = watch(`permissions.secrets.${position}.conditions.${index}.lhs`);
          return (
            <div
              key={el.id}
              className="flex gap-2 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md"
            >
              <div className="w-1/4">
                <Controller
                  control={control}
                  name={`permissions.secrets.${position}.conditions.${index}.lhs`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => field.onChange(e)}
                        className="w-full"
                      >
                        <SelectItem value="environment">Environment Slug</SelectItem>
                        <SelectItem value="secretPath">Secret Path</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </div>
              <div className="w-36">
                <Controller
                  control={control}
                  name={`permissions.secrets.${position}.conditions.${index}.operator`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0 flex-grow"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => field.onChange(e)}
                        className="w-full"
                      >
                        <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
                        <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
                        <SelectItem value={PermissionConditionOperators.$GLOB}>
                          Glob Match
                        </SelectItem>
                        <SelectItem value={PermissionConditionOperators.$IN}>Contains</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex-grow">
                <Controller
                  control={control}
                  name={`permissions.secrets.${position}.conditions.${index}.rhs`}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="mb-0 flex-grow"
                    >
                      <Input {...field} placeholder={getValueLabel(lhs)} />
                    </FormControl>
                  )}
                />
              </div>
              <div>
                <IconButton
                  ariaLabel="plus"
                  variant="outline_bg"
                  className="p-2.5"
                  onClick={() => items.remove(index)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
      {errors?.permissions?.secrets?.[position]?.conditions?.message && (
        <div className="flex items-center space-x-2 py-2 text-sm text-gray-400">
          <FontAwesomeIcon icon={faWarning} className="text-red" />
          <span>{errors?.permissions?.secrets?.[position]?.conditions?.message}</span>
        </div>
      )}
      <div>{}</div>
      <div>
        <Button
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          variant="star"
          size="xs"
          className="mt-3"
          isDisabled={isDisabled}
          onClick={() =>
            items.append({
              lhs: "environment",
              operator: PermissionConditionOperators.$EQ,
              rhs: ""
            })
          }
        >
          New Condition
        </Button>
      </div>
    </div>
  );
};
