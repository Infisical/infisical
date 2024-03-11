import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useRenameWorkspace } from "@app/hooks/api";

const formSchema = yup.object({
  name: yup.string().required().label("Project Name").max(64, "Too long, maximum length is 64 characters"),
});

type FormData = yup.InferType<typeof formSchema>;

export const ProjectNameChangeSection = () => {
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isLoading } = useRenameWorkspace();
  const [isProjectIdCopied, setIsProjectIdCopied] = useToggle(false);

  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: yupResolver(formSchema) });

  useEffect(() => {
    if (currentWorkspace) {
      reset({
        name: currentWorkspace.name
      });
    }
  }, [currentWorkspace]);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isProjectIdCopied) {
      timer = setTimeout(() => setIsProjectIdCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
}, [setIsProjectIdCopied]);

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        workspaceID: currentWorkspace.id,
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

  const copyProjectIdToClipboard = () => {
    navigator.clipboard.writeText(currentWorkspace?.id || "");
    setIsProjectIdCopied.on();

    createNotification({
      text: "Copied Project ID to clipboard",
      type: "success"
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="flex justify-betweens">
        <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">Project Name</h2>
        <div>
          <Button
            colorSchema="secondary"
            className="group relative"
            leftIcon={<FontAwesomeIcon icon={isProjectIdCopied ? faCheck : faCopy} />}
            onClick={copyProjectIdToClipboard}
          >
            Copy Project ID
            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
              Click to copy
            </span>
          </Button>
        </div>
      </div>

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
