import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";
import {
  useCreateProjectIdentityMembership,
  useGetIdentityProjectMemberships,
  useGetProjectRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    project: z.object({ name: z.string(), id: z.string(), type: z.string().optional() }),
    role: z.object({ name: z.string(), slug: z.string(), description: z.string().nullish() })
  })
  .required();

type FormData = z.infer<typeof schema>;

type Props = {
  identityId: string;
  popUp: UsePopUpState<["addIdentityToProject"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addIdentityToProject"]>,
    state?: boolean
  ) => void;
};

// TODO: eventually refactor to support adding to multiple projects at once? would lose role granularity unique to project

export const IdentityAddToProjectModal = ({ identityId, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const { data: workspaces = [], isPending: isWorkspacesLoading } = useGetUserProjects();
  const { mutateAsync: addIdentityToWorkspace } = useCreateProjectIdentityMembership();

  const {
    control,
    handleSubmit,
    reset,
    resetField,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const projectId = watch("project")?.id;
  const { data: projectMemberships } = useGetIdentityProjectMemberships(identityId);
  const { data: roles = [], isPending: isRolesLoading } = useGetProjectRoles(projectId ?? "");

  const filteredWorkspaces = useMemo(() => {
    const wsWorkspaceIds = new Map();

    projectMemberships?.forEach((projectMembership) => {
      wsWorkspaceIds.set(projectMembership.project.id, true);
    });

    return (workspaces || []).filter(
      ({ id, orgId }) => !wsWorkspaceIds.has(id) && orgId === currentOrg?.id
    );
  }, [workspaces, projectMemberships]);

  const handleOpenChange = (isOpen: boolean) => {
    handlePopUpToggle("addIdentityToProject", isOpen);
    if (!isOpen) reset();
  };

  const onFormSubmit = async ({ project: selectedProject, role }: FormData) => {
    await addIdentityToWorkspace({
      projectId: selectedProject.id,
      projectType: selectedProject.type,
      identityId,
      role: role.slug || undefined
    });

    createNotification({
      text: "Successfully added identity to project",
      type: "success"
    });

    handleOpenChange(false);
  };

  const isProjectSelected = Boolean(projectId);

  return (
    <Dialog open={popUp?.addIdentityToProject?.isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Machine Identity to Project</DialogTitle>
          <DialogDescription>
            Select a project and the role this machine identity should have in it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="project"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-identity-to-project-project">Project</FieldLabel>
                <Combobox
                  id="add-identity-to-project-project"
                  value={value ?? null}
                  onValueChange={(project) => {
                    onChange(project);
                    resetField("role");
                  }}
                  options={filteredWorkspaces}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                  placeholder="Select project..."
                  searchPlaceholder="Search projects..."
                  searchAriaLabel="Search projects"
                  emptyMessage={
                    filteredWorkspaces.length === 0
                      ? "This identity is already a member of every project you can access."
                      : "No projects found."
                  }
                  isLoading={isWorkspacesLoading}
                  isError={Boolean(error)}
                  modal
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-identity-to-project-role">Role</FieldLabel>
                <Combobox
                  id="add-identity-to-project-role"
                  value={value ?? null}
                  onValueChange={onChange}
                  options={roles}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  getOptionKeywords={(option) => (option.description ? [option.description] : [])}
                  placeholder="Select role..."
                  searchPlaceholder="Search roles..."
                  searchAriaLabel="Search project roles"
                  emptyMessage="No project roles found."
                  isDisabled={!isProjectSelected}
                  isLoading={isProjectSelected && isRolesLoading}
                  isError={Boolean(error)}
                  modal
                  renderOption={(option) => (
                    <div className="min-w-0">
                      <p className="truncate">{option.name}</p>
                      {option.description && (
                        <p className="text-xs leading-4 break-words whitespace-normal text-muted">
                          {option.description}
                        </p>
                      )}
                    </div>
                  )}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add to Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
