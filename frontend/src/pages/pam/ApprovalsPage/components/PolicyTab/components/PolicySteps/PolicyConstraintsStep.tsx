import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, IconButton, Input } from "@app/components/v2";

import { TPolicyForm } from "../PolicySchema";

export const PolicyConstraintsStep = () => {
  const { control } = useFormContext<TPolicyForm>();

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition
  } = useFieldArray({
    control,
    name: "conditions"
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="pb-0.5 text-sm font-medium text-mineshaft-200">Conditions</p>
            <p className="text-xs text-mineshaft-400">
              Define which resources and account paths this policy applies to
            </p>
          </div>
          <Button
            type="button"
            variant="outline_bg"
            size="xs"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => appendCondition({ resourceIds: [], accountPaths: [] })}
          >
            Add Condition
          </Button>
        </div>
        <div>
          {conditionFields.map((field, index) => (
            <div key={field.id}>
              <div className="rounded border border-mineshaft-600 bg-mineshaft-800 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-mineshaft-300">
                    Condition {index + 1}
                  </span>
                  {conditionFields.length > 1 && (
                    <IconButton
                      ariaLabel="Remove condition"
                      variant="plain"
                      size="xs"
                      onClick={() => removeCondition(index)}
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-red-500" />
                    </IconButton>
                  )}
                </div>
                <div className="space-y-3">
                  <Controller
                    control={control}
                    name={`conditions.${index}.resourceIds`}
                    render={({ field: resourceField, fieldState: { error } }) => (
                      <FormControl
                        label="Resource IDs"
                        isError={Boolean(error)}
                        errorText={error?.message}
                        helperText="Comma-separated UUIDs of resources this condition applies to"
                      >
                        <Input
                          value={resourceField.value.join(", ")}
                          onChange={(e) => {
                            const ids = e.target.value
                              .split(",")
                              .map((id) => id.trim())
                              .filter(Boolean);
                            resourceField.onChange(ids);
                          }}
                          placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000, ..."
                        />
                      </FormControl>
                    )}
                  />
                  <div className="flex items-center justify-center">
                    <div style={{ height: "1px" }} className="w-1/5 bg-mineshaft-500" />
                    <span className="px-2 text-xs font-medium text-mineshaft-400">AND</span>
                    <div style={{ height: "1px" }} className="w-1/5 bg-mineshaft-500" />
                  </div>
                  <Controller
                    control={control}
                    name={`conditions.${index}.accountPaths`}
                    render={({ field: pathField, fieldState: { error } }) => (
                      <FormControl
                        label="Account Paths"
                        isError={Boolean(error)}
                        errorText={error?.message}
                        helperText="Comma-separated account paths this condition applies to"
                      >
                        <Input
                          value={pathField.value.join(", ")}
                          onChange={(e) => {
                            const paths = e.target.value
                              .split(",")
                              .map((path) => path.trim())
                              .filter(Boolean);
                            pathField.onChange(paths);
                          }}
                          placeholder="e.g., /admin/*, /users/john"
                        />
                      </FormControl>
                    )}
                  />
                </div>
              </div>
              {index < conditionFields.length - 1 && (
                <div className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-px bg-mineshaft-500" />
                    <span className="px-2 text-xs font-medium text-mineshaft-400">OR</span>
                    <div className="h-3 w-px bg-mineshaft-500" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
