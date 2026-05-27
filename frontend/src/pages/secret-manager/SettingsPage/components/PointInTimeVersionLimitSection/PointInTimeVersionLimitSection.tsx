import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const formSchema = z.object({
  pitVersionLimit: z.coerce.number().min(1).max(100)
});

type TForm = z.infer<typeof formSchema>;

export const PointInTimeVersionLimitSection = () => {
  const { mutateAsync: updateProject } = useUpdateProject();

  const { currentProject, projectId } = useProject();
  const { hasProjectRole } = useProjectPermission();

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      pitVersionLimit: currentProject?.pitVersionLimit || 10
    }
  });

  if (!currentProject) return null;

  const handleVersionLimitSubmit = async ({ pitVersionLimit }: TForm) => {
    await updateProject({
      pitVersionLimit,
      projectId
    });

    createNotification({
      text: "Successfully updated version limit",
      type: "success"
    });
  };

  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Version Retention</CardTitle>
        <CardDescription>
          This defines the maximum number of recent secret versions to keep per folder. Excess
          versions will be removed at midnight (UTC) each day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(handleVersionLimitSubmit)} autoComplete="off">
          <Controller
            control={control}
            defaultValue={0}
            name="pitVersionLimit"
            render={({ field, fieldState: { error } }) => (
              <Field className="max-w-xs">
                <FieldLabel htmlFor="pitVersionLimit">Recent versions to keep</FieldLabel>
                <Input
                  id="pitVersionLimit"
                  type="number"
                  min={1}
                  step={1}
                  isError={Boolean(error)}
                  disabled={!isAdmin}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Button
            className="mt-4"
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
