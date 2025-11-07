import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input } from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const formSchema = z.object({
  ignoreValues: z
    .object({
      value: z.string().trim().min(1, "Secret value is required")
    })
    .array()
    .default([])
});

type TForm = z.infer<typeof formSchema>;

export const SecretDetectionIgnoreValuesSection = () => {
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const { mutateAsync: updateProject } = useUpdateProject();

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit,
    reset
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ignoreValues: []
    }
  });

  const ignoreValuesFormFields = useFieldArray({
    control,
    name: "ignoreValues"
  });

  useEffect(() => {
    const existingIgnoreValues = currentProject?.secretDetectionIgnoreValues || [];
    reset({
      ignoreValues:
        existingIgnoreValues.length > 0
          ? existingIgnoreValues.map((value) => ({ value }))
          : [{ value: "" }] // Show one empty field by default
    });
  }, [currentProject?.secretDetectionIgnoreValues, reset]);

  const handleIgnoreValuesSubmit = async ({ ignoreValues }: TForm) => {
    await updateProject({
      projectId: currentProject.id,
      secretDetectionIgnoreValues: ignoreValues.map((item) => item.value)
    });

    createNotification({
      text: "Successfully updated secret detection ignore values",
      type: "success"
    });
  };

  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  if (!currentProject) return null;

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-medium">Secret Detection</p>
      </div>
      <p className="mt-2 mb-4 max-w-2xl text-sm text-gray-400">
        Define secret values to ignore when scanning designated parameter folders. Add values here
        to prevent false positives or allow approved sensitive data. These ignored values will not
        trigger policy violation alerts.
      </p>

      <form onSubmit={handleSubmit(handleIgnoreValuesSubmit)} autoComplete="off">
        <div className="mb-4">
          <div className="flex flex-col space-y-2">
            {ignoreValuesFormFields.fields.map(({ id: ignoreValueFieldId }, i) => (
              <div key={ignoreValueFieldId} className="flex items-end space-x-2">
                <div className="grow">
                  {i === 0 && <span className="text-xs text-mineshaft-400">Secret Value</span>}
                  <Controller
                    control={control}
                    name={`ignoreValues.${i}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} placeholder="sk-1234567890abcdef" isDisabled={!isAdmin} />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete ignore value"
                  className="bottom-0.5 h-9"
                  variant="outline_bg"
                  onClick={() => ignoreValuesFormFields.remove(i)}
                  isDisabled={!isAdmin}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
            <div className="mt-2 flex justify-end">
              <Button
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                size="xs"
                variant="outline_bg"
                onClick={() => ignoreValuesFormFields.append({ value: "" })}
                isDisabled={!isAdmin}
              >
                Add value to ignore
              </Button>
            </div>
          </div>
        </div>

        <Button
          colorSchema="secondary"
          type="submit"
          isLoading={isSubmitting}
          disabled={!isAdmin || !isDirty}
        >
          Save
        </Button>
      </form>
    </div>
  );
};
