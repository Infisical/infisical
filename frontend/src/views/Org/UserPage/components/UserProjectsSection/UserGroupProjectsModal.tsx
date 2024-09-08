import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { faFolder, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";
import { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

export type UserGroupsProjectsModalData = {
  group: TGroupWithProjectMemberships;
  groupSlug: string;
  username: string;
};

export const UserGroupsProjectsModal = ({
  popUp,
  handlePopUpToggle
}: {
  popUp: UsePopUpState<["userGroupsProjects"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["userGroupsProjects"]>,
    state?: boolean
  ) => void;
}) => {
  const popupData = popUp.userGroupsProjects.data as UserGroupsProjectsModalData;

  const [filteredProjectName, setFilteredProjectName] = useState("");

  const { mutateAsync: deleteGroupFromProject } = useDeleteGroupFromWorkspace();

  const filteredMemberships = useMemo(() => {
    if (!popupData?.group) return [];

    return popupData.group.projectMemberships.filter(({ project }) => {
      return project.name.toLowerCase().includes(filteredProjectName.toLowerCase());
    });
  }, [filteredProjectName, popupData?.group?.projectMemberships]);

  const removeProjectFromGroup = useCallback(
    async (projectSlug: string) => {
      await deleteGroupFromProject({
        groupSlug: popupData.groupSlug,
        projectSlug,
        username: popupData.username
      });

      createNotification({
        type: "success",
        text: "Project removed from group"
      });

      // Manually remove the project from the list, since the query invalidation won't trigger the popup data to be updated
      popupData.group.projectMemberships = popupData.group.projectMemberships.filter(
        (membership) => membership.project.slug !== projectSlug
      );
    },
    [popupData]
  );

  return (
    <Modal
      isOpen={popUp.userGroupsProjects.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("userGroupsProjects", open);
      }}
    >
      <ModalContent title="Manage Group Projects">
        <Input
          value={filteredProjectName}
          onChange={(e) => setFilteredProjectName(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search projects..."
        />
        <TableContainer className="mt-4">
          <Table>
            <THead>
              <Tr>
                <Th>Project</Th>
              </Tr>
            </THead>
            <TBody className="w-full">
              {filteredMemberships?.map(({ project, roles }) => {
                return (
                  <Tr
                    className="flex w-full items-center justify-between"
                    key={`group-project-${project.id}`}
                  >
                    <Td>
                      <Link href={`/project/${project.id}/secrets/overview`}>
                        <p className="cursor-pointer font-medium capitalize transition-all hover:text-primary-500">
                          {project.name}
                        </p>
                      </Link>
                      {/* If there's only one role, display the role.name. If more, display role.name (+X more) */}
                      <Tooltip
                        isDisabled={roles.length === 1}
                        content={roles
                          .map((role) => role.role.charAt(0).toUpperCase() + role.role.slice(1))
                          .join(", ")}
                      >
                        <p className="text-xs capitalize">
                          {roles.length === 1
                            ? roles[0].role
                            : `${roles[0].role} (+${roles.length - 1} more)`}
                        </p>
                      </Tooltip>
                    </Td>
                    <Td className="flex h-full items-center justify-end">
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
                        a={OrgPermissionSubjects.Groups}
                      >
                        {(isAllowed) => {
                          return (
                            <div className="flex h-full items-center">
                              <Button
                                isDisabled={!isAllowed}
                                colorSchema="primary"
                                size="xs"
                                variant="outline_bg"
                                type="submit"
                                onClick={() => removeProjectFromGroup(project.slug)}
                              >
                                Remove group membership
                              </Button>
                            </div>
                          );
                        }}
                      </OrgPermissionCan>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {!filteredMemberships.length && <EmptyState title="No projects found" icon={faFolder} />}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
