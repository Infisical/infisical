import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
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
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-medium">Version Retention</p>
      </div>
      <p className="mt-2 mb-4 max-w-2xl text-sm text-gray-400">
        This defines the maximum number of recent secret versions to keep per folder. Excess
        versions will be removed at midnight (UTC) each day.
      </p>
      <form onSubmit={handleSubmit(handleVersionLimitSubmit)} autoComplete="off">
        <div className="max-w-xs">
          <Controller
            control={control}
            defaultValue={0}
            name="pitVersionLimit"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="Recent versions to keep"
              >
                <Input {...field} type="number" min={1} step={1} isDisabled={!isAdmin} />
              </FormControl>
            )}
          />
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
