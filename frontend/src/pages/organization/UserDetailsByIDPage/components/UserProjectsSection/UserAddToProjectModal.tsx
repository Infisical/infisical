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
  useAddUserToWsNonE2EE,
  useGetOrgMembershipProjectMemberships,
  useGetUserProjects
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    project: z.object({ name: z.string(), id: z.string() })
  })
  .required();

type FormData = z.infer<typeof schema>;

type Props = {
  membershipId: string;
  popUp: UsePopUpState<["addUserToProject"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addUserToProject"]>,
    state?: boolean
  ) => void;
};

export const UserAddToProjectModal = ({ membershipId, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const orgId = currentOrg?.id || "";
  const { data: workspaces = [], isPending: isWorkspacesLoading } = useGetUserProjects();
  const { mutateAsync: addUserToWorkspaceNonE2EE } = useAddUserToWsNonE2EE();

  const popupData = popUp.addUserToProject.data as {
    username: string;
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { data: projectMemberships } = useGetOrgMembershipProjectMemberships(orgId, membershipId);

  const filteredWorkspaces = useMemo(() => {
    const wsWorkspaceIds = new Map();

    projectMemberships?.forEach((projectMembership) => {
      wsWorkspaceIds.set(projectMembership.project.id, true);
    });

    return (workspaces || []).filter(
      ({ id, orgId: projectOrgId, version }) =>
        !wsWorkspaceIds.has(id) && projectOrgId === currentOrg?.id && version !== ProjectVersion.V1
    );
  }, [workspaces, projectMemberships]);

  const handleOpenChange = (isOpen: boolean) => {
    handlePopUpToggle("addUserToProject", isOpen);
    if (!isOpen) reset();
  };

  const onFormSubmit = async ({ project }: FormData) => {
    await addUserToWorkspaceNonE2EE({
      projectId: project.id,
      usernames: [popupData.username],
      orgId
    });

    createNotification({
      text: "Successfully added user to project",
      type: "success"
    });

    handleOpenChange(false);
  };

  return (
    <Dialog open={popUp?.addUserToProject?.isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User to Project</DialogTitle>
          <DialogDescription>Select a project to add this user to.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="project"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-user-to-project-project">Project</FieldLabel>
                <Combobox
                  id="add-user-to-project-project"
                  value={value ?? null}
                  onValueChange={onChange}
                  options={filteredWorkspaces}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                  placeholder="Select project..."
                  searchPlaceholder="Search projects..."
                  searchAriaLabel="Search projects"
                  emptyMessage={
                    filteredWorkspaces.length === 0
                      ? "This user is already a member of every project you can access."
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
