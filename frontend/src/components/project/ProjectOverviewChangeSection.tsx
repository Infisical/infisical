import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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

type BaseFormData = z.infer<typeof baseFormSchema>;
type Props = {
  showSlugField?: boolean;
};

export const ProjectOverviewChangeSection = ({ showSlugField = false }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useUpdateProject();
  const { handleSubmit, control, reset } = useForm<BaseFormData>({
    resolver: zodResolver(baseFormSchema)
  });

  useEffect(() => {
    if (currentProject) {
      reset({
        name: currentProject.name,
        description: currentProject.description ?? ""
      });
    }
  }, [currentProject, reset]);

  const onFormSubmit = async (data: BaseFormData) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      newProjectName: data.name,
      newProjectDescription: data.description
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
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex max-w-5xl flex-col gap-4">
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
                        autoComplete="off"
                        name="project-name"
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
              <Field>
                <FieldLabel htmlFor="project-slug">Project slug</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="project-slug" value={currentProject?.slug ?? ""} readOnly />
                  <InputGroupAddon align="inline-end">
                    <CopyButton value={currentProject?.slug ?? ""} ariaLabel="Copy project slug" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
            {showSlugField && (
              <Field>
                <FieldLabel htmlFor="project-id">Project ID</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="project-id"
                    value={currentProject?.id ?? ""}
                    readOnly
                    className="font-mono text-muted"
                  />
                  <InputGroupAddon align="inline-end">
                    <CopyButton value={currentProject?.id ?? ""} ariaLabel="Copy project ID" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
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
