import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useCreateProjectIdentityMembership,
  useGetIdentityProjectMemberships,
  useGetProjectRoles,
  useGetUserProjects,
  useGetWorkspaceById
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    project: z.object({ name: z.string(), id: z.string() }),
    role: z.object({ name: z.string(), slug: z.string() })
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

const Content = ({ identityId, handlePopUpToggle }: Omit<Props, "popUp">) => {
  const { currentOrg } = useOrganization();
  const { data: workspaces = [] } = useGetUserProjects();
  const { mutateAsync: addIdentityToWorkspace } = useCreateProjectIdentityMembership();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const projectId = watch("project")?.id;
  const { data: projectMemberships } = useGetIdentityProjectMemberships(identityId);
  const { data: project, isPending: isProjectLoading } = useGetWorkspaceById(projectId);
  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(project?.id ?? "");

  const filteredWorkspaces = useMemo(() => {
    const wsWorkspaceIds = new Map();

    projectMemberships?.forEach((projectMembership) => {
      wsWorkspaceIds.set(projectMembership.project.id, true);
    });

    return (workspaces || []).filter(
      ({ id, orgId }) => !wsWorkspaceIds.has(id) && orgId === currentOrg?.id
    );
  }, [workspaces, projectMemberships]);

  const onFormSubmit = async ({ project: selectedProject, role }: FormData) => {
    await addIdentityToWorkspace({
      projectId: selectedProject.id,
      identityId,
      role: role.slug || undefined
    });

    createNotification({
      text: "Successfully added identity to project",
      type: "success"
    });

    reset();
    handlePopUpToggle("addIdentityToProject", false);
  };

  const isProjectSelected = Boolean(projectId);

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="project"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="Project"
            errorText={error?.message}
            isError={Boolean(error)}
            className="mt-4"
          >
            <FilterableSelect
              value={value}
              onChange={onChange}
              options={filteredWorkspaces}
              placeholder="Select project..."
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              isLoading={isProjectSelected && isProjectLoading}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="Role"
            errorText={error?.message}
            isError={Boolean(error)}
            className="mt-4"
          >
            <FilterableSelect
              isDisabled={!isProjectSelected}
              value={value}
              onChange={onChange}
              options={roles}
              isLoading={isProjectSelected && isRolesLoading}
              placeholder="Select role..."
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
            />
          </FormControl>
        )}
      />
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Add
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const IdentityAddToProjectModal = ({ identityId, popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.addIdentityToProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addIdentityToProject", isOpen);
      }}
    >
      <ModalContent bodyClassName="overflow-visible" title="Add Identity to Project">
        <Content identityId={identityId} handlePopUpToggle={handlePopUpToggle} />
      </ModalContent>
    </Modal>
  );
};
