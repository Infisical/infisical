import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  IconButton,
  Input
} from "@app/components/v3";
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Secret Detection</CardTitle>
        <CardDescription>
          Define secret values to ignore when scanning designated parameter folders. Add values here
          to prevent false positives or allow approved sensitive data. These ignored values will not
          trigger policy violation alerts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(handleIgnoreValuesSubmit)} autoComplete="off">
          <div className="mb-4 flex flex-col gap-2">
            {ignoreValuesFormFields.fields.map(({ id: ignoreValueFieldId }, i) => (
              <div key={ignoreValueFieldId} className="flex items-start gap-2">
                <Controller
                  control={control}
                  name={`ignoreValues.${i}.value`}
                  render={({ field, fieldState: { error } }) => (
                    <Field className="grow">
                      {i === 0 && <span className="text-xs text-accent">Secret Value</span>}
                      <Input
                        {...field}
                        placeholder="sk-1234567890abcdef"
                        isError={Boolean(error?.message)}
                        disabled={!isAdmin}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <IconButton
                  aria-label="Delete ignore value"
                  variant="ghost"
                  size="sm"
                  className={i === 0 ? "mt-[1.4rem]" : ""}
                  onClick={() => ignoreValuesFormFields.remove(i)}
                  isDisabled={!isAdmin}
                >
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>
            ))}
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => ignoreValuesFormFields.append({ value: "" })}
                isDisabled={!isAdmin}
              >
                <PlusIcon className="size-4" />
                Add value to ignore
              </Button>
            </div>
          </div>

          <Button
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={!isAdmin || !isDirty}
          >
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
