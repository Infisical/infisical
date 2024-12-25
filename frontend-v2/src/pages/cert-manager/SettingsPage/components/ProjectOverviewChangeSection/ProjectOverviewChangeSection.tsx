import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

import { CopyButton } from "./CopyButton";

const formSchema = z.object({
  name: z.string().min(1, "Required").max(64, "Too long, maximum length is 64 characters"),
  description: z
    .string()
    .trim()
    .max(256, "Description too long, max length is 256 characters")
    .optional()
});

type FormData = z.infer<typeof formSchema>;

export const ProjectOverviewChangeSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isPending } = useUpdateProject();

  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (currentWorkspace) {
      reset({
        name: currentWorkspace.name,
        description: currentWorkspace.description ?? ""
      });
    }
  }, [currentWorkspace]);

  const onFormSubmit = async ({ name, description }: FormData) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        projectID: currentWorkspace.id,
        newProjectName: name,
        newProjectDescription: description
      });

      createNotification({
        text: "Successfully updated project overview",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update project overview",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="justify-betweens flex">
        <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Project Overview</h2>
        <div className="space-x-2">
          <CopyButton
            value={currentWorkspace?.slug || ""}
            hoverText="Click to project slug"
            notificationText="Copied project slug to clipboard"
          >
            Copy Project Slug
          </CopyButton>
          <CopyButton
            value={currentWorkspace?.id || ""}
            hoverText="Click to project ID"
            notificationText="Copied project ID to clipboard"
          >
            Copy Project ID
          </CopyButton>
        </div>
      </div>
      <div>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col gap-0">
          <div className="flex w-full flex-row items-end gap-4">
            <div className="w-full max-w-md">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Project}
              >
                {(isAllowed) => (
                  <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error)}
                        errorText={error?.message}
                        label="Project name"
                      >
                        <Input
                          placeholder="Project name"
                          {...field}
                          className="bg-mineshaft-800"
                          isDisabled={!isAllowed}
                        />
                      </FormControl>
                    )}
                    control={control}
                    name="name"
                  />
                )}
              </ProjectPermissionCan>
            </div>
          </div>
          <div className="flex w-full flex-row items-end gap-4">
            <div className="w-full max-w-md">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Project}
              >
                {(isAllowed) => (
                  <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error)}
                        errorText={error?.message}
                        label="Project description"
                      >
                        <TextArea
                          placeholder="Project description"
                          {...field}
                          rows={3}
                          className="thin-scrollbar max-w-md !resize-none bg-mineshaft-800"
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
          </div>
          <div>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  isLoading={isPending}
                  isDisabled={isPending || !isAllowed}
                >
                  Save
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
        </form>
      </div>
    </div>
  );
};
