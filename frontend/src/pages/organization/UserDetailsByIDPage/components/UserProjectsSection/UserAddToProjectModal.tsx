import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useAddUserToWsNonE2EE,
  useGetOrgMembershipProjectMemberships,
  useGetUserProjects
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    projectId: z.string()
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

const UserAddToProjectModalChild = ({ membershipId, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: workspaces = [] } = useGetUserProjects();

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

  const onFormSubmit = async ({ projectId }: FormData) => {
    await addUserToWorkspaceNonE2EE({
      projectId,
      usernames: [popupData.username],
      orgId
    });

    createNotification({
      text: "Successfully added user to project",
      type: "success"
    });

    reset();
    handlePopUpToggle("addUserToProject", false);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="projectId"
        defaultValue=""
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Project" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {(filteredWorkspaces || []).map(({ id, name }) => (
                <SelectItem value={id} key={`project-${id}`}>
                  {name}
                </SelectItem>
              ))}
            </Select>
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
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("addUserToProject", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

export const UserAddToProjectModal = (props: Props) => {
  const { popUp, handlePopUpToggle } = props;
  return (
    <Modal
      isOpen={popUp?.addUserToProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addUserToProject", isOpen);
      }}
    >
      <ModalContent title="Add User to Project">
        <UserAddToProjectModalChild {...props} />
      </ModalContent>
    </Modal>
  );
};
