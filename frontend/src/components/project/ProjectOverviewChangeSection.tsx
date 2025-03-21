import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

const baseFormSchema = z.object({
  name: z.string().min(1, "Required").max(64, "Too long, maximum length is 64 characters"),
  description: z
    .string()
    .trim()
    .max(256, "Description too long, max length is 256 characters")
    .optional()
});

const formSchemaWithSlug = baseFormSchema.extend({
  slug: z
    .string()
    .min(1, "Required")
    .max(64, "Too long, maximum length is 64 characters")
    .regex(
      /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
      "Project slug can only contain lowercase letters and numbers, with optional single hyphens (-) or underscores (_) between words. Cannot start or end with a hyphen or underscore."
    )
});

type BaseFormData = z.infer<typeof baseFormSchema>;
type FormDataWithSlug = z.infer<typeof formSchemaWithSlug>;

type Props = {
  showSlugField?: boolean;
};

export const ProjectOverviewChangeSection = ({ showSlugField = false }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isPending } = useUpdateProject();
  const { handleSubmit, control, reset, watch } = useForm<BaseFormData | FormDataWithSlug>({
    resolver: zodResolver(showSlugField ? formSchemaWithSlug : baseFormSchema)
  });

  const currentSlug = showSlugField ? watch("slug") : currentWorkspace?.slug;

  useEffect(() => {
    if (currentWorkspace) {
      reset({
        name: currentWorkspace.name,
        description: currentWorkspace.description ?? "",
        ...(showSlugField && { slug: currentWorkspace.slug })
      });
    }
  }, [currentWorkspace, showSlugField]);

  const onFormSubmit = async (data: BaseFormData | FormDataWithSlug) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        projectID: currentWorkspace.id,
        newProjectName: data.name,
        newProjectDescription: data.description,
        ...(showSlugField &&
          "slug" in data && {
            newSlug: data.slug !== currentWorkspace.slug ? data.slug : undefined
          })
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

  const [canCopy, setCanCopy] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!navigator.clipboard) {
      setCanCopy(false);
      setErrorMessage("Clipboard API is not supported in this browser.");
    } else if (window.location.protocol !== "https:") {
      setCanCopy(false);
      setErrorMessage("Clipboard API requires HTTPS to function.");
    }
  }, []);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      createNotification({
        text: `Copied ${label} to clipboard`,
        type: "success"
      });
    } catch (error: unknown) {
      console.error(`Clipboard copy error (${label}):`, error);
      const message = error instanceof Error ? error.message : "An unknown error occurred while copying.";
      setErrorMessage(message);
      createNotification({
        text: `Failed to copy ${label}: ${message}`,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="justify-betweens flex">
        <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Project Overview</h2>
        <div className="space-x-2">
          <Button
            variant="outline_bg"
            size="sm"
            onClick={() => handleCopy(currentWorkspace?.slug || "", "project slug")}
            disabled={!canCopy}
            title={!canCopy ? errorMessage : "Click to copy project slug"}
          >
            Copy Project Slug
          </Button>

          <Button
            variant="outline_bg"
            size="sm"
            onClick={() => handleCopy(currentWorkspace?.id || "", "project ID")}
            disabled={!canCopy}
            title={!canCopy ? errorMessage : "Click to copy project ID"}
          >
            Copy Project ID
          </Button>
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
          {showSlugField && (
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
                          label="Project slug"
                        >
                          <Input
                            placeholder="Project slug"
                            {...field}
                            className="bg-mineshaft-800"
                            isDisabled={!isAllowed}
                          />
                        </FormControl>
                      )}
                      control={control}
                      name="slug"
                    />
                  )}
                </ProjectPermissionCan>
              </div>
            </div>
          )}
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
