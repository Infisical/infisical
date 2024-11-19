import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useSetWorkspaceDescription } from "@app/hooks/api/workspace/queries";

const formSchema = z.object({
  description: z.string().trim().max(256, "Description too long, max length is 256 characters")
});

type FormData = z.infer<typeof formSchema>;

export const ProjectDescriptionChangeSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isLoading } = useSetWorkspaceDescription();

  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (currentWorkspace) {
      reset({
        description: currentWorkspace.description
      });
    }
  }, [currentWorkspace]);

  const onFormSubmit = async ({ description }: FormData) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        workspaceID: currentWorkspace.id,
        newWorkspaceDescription: description
      });

      createNotification({
        text: "Successfully set workspace description",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to change workspace description",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="justify-betweens flex">
        <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">
          Project Description
        </h2>
      </div>
      <div className="max-w-md">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Project}>
          {(isAllowed) => (
            <Controller
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Input
                    placeholder="Project description"
                    {...field}
                    className="bg-mineshaft-800"
                    isDisabled={!isAllowed}
                  />
                </FormControl>
              )}
              control={control}
              name="description"
            />
          )}
        </ProjectPermissionCan>
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Project}>
        {(isAllowed) => (
          <Button
            colorSchema="secondary"
            type="submit"
            isLoading={isLoading}
            isDisabled={isLoading || !isAllowed}
          >
            Save
          </Button>
        )}
      </ProjectPermissionCan>
    </form>
  );
};
