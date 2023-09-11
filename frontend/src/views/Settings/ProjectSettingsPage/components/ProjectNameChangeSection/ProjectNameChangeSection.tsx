import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useRenameWorkspace } from "@app/hooks/api";

const formSchema = yup.object({
  name: yup.string().required().label("Project Name")
});

type FormData = yup.InferType<typeof formSchema>;

export const ProjectNameChangeSection = () => {
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isLoading } = useRenameWorkspace();

  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: yupResolver(formSchema) });

  useEffect(() => {
    if (currentWorkspace) {
      reset({
        name: currentWorkspace.name
      });
    }
  }, [currentWorkspace]);

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!currentWorkspace?._id) return;

      await mutateAsync({
        workspaceID: currentWorkspace._id,
        newWorkspaceName: name
      });

      createNotification({
        text: "Successfully renamed workspace",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to rename workspace",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
    >
      <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">Project Name</h2>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input placeholder="Project name" {...field} className="bg-mineshaft-800" />
            </FormControl>
          )}
          control={control}
          name="name"
        />
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Workspace}>
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
