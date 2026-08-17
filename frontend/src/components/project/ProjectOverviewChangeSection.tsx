import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

const baseFormSchema = z.object({
  name: z.string().min(1, "Required").max(64, "Too long, maximum length is 64 characters"),
  description: z
    .string()
    .trim()
    .max(1024, "Description too long, max length is 1024 characters")
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
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useUpdateProject();
  const { handleSubmit, control, reset, watch } = useForm<BaseFormData | FormDataWithSlug>({
    resolver: zodResolver(showSlugField ? formSchemaWithSlug : baseFormSchema)
  });

  const currentSlug = showSlugField ? watch("slug") : currentProject?.slug;

  useEffect(() => {
    if (currentProject) {
      reset({
        name: currentProject.name,
        description: currentProject.description ?? "",
        ...(showSlugField && { slug: currentProject.slug })
      });
    }
  }, [currentProject, showSlugField]);

  const onFormSubmit = async (data: BaseFormData | FormDataWithSlug) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      newProjectName: data.name,
      newProjectDescription: data.description,
      ...(showSlugField &&
        "slug" in data && {
          newSlug: data.slug !== currentProject.slug ? data.slug : undefined
        })
    });

    createNotification({
      text: "Successfully updated project overview",
      type: "success"
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Project Overview</CardTitle>
        <CardAction className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(currentSlug || "");
              createNotification({
                text: "Copied project slug to clipboard",
                type: "success"
              });
            }}
            title="Click to copy project slug"
          >
            Copy Project Slug
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(currentProject?.id || "");
              createNotification({
                text: "Copied project ID to clipboard",
                type: "success"
              });
            }}
            title="Click to copy project ID"
          >
            Copy Project ID
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex max-w-md flex-col gap-4">
          <FieldGroup>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
            >
              {(isAllowed) => (
                <Controller
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                      <Input
                        id="project-name"
                        placeholder="Project name"
                        {...field}
                        disabled={!isAllowed}
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                  control={control}
                  name="name"
                />
              )}
            </ProjectPermissionCan>
            {showSlugField && (
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Project}
              >
                {(isAllowed) => (
                  <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="project-slug">Project slug</FieldLabel>
                        <Input
                          id="project-slug"
                          placeholder="Project slug"
                          {...field}
                          disabled={!isAllowed}
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                    control={control}
                    name="slug"
                  />
                )}
              </ProjectPermissionCan>
            )}
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
            >
              {(isAllowed) => (
                <Controller
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="project-description">Project description</FieldLabel>
                      <TextArea
                        id="project-description"
                        placeholder="Project description"
                        {...field}
                        rows={3}
                        className="resize-none"
                        disabled={!isAllowed}
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                  control={control}
                  name="description"
                />
              )}
            </ProjectPermissionCan>
          </FieldGroup>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Project}>
            {(isAllowed) => (
              <Button variant="project" type="submit" isPending={isPending} isDisabled={!isAllowed}>
                Save
              </Button>
            )}
          </ProjectPermissionCan>
        </form>
      </CardContent>
    </Card>
  );
};
