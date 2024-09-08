import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { faFolder, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  IconButton,
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

type Props = {
  group: TGroupWithProjectMemberships;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: {}) => void;
};

const GroupProjectsModal = ({
  isOpen,
  group,
  groupSlug,
  setIsOpen
}: {
  setIsOpen: (open: boolean) => void;
  isOpen: boolean;
  group: TGroupWithProjectMemberships;
  groupSlug: string;
}) => {
  const [filteredProjectName, setFilteredProjectName] = useState("");

  const { mutateAsync: deleteGroupFromProject } = useDeleteGroupFromWorkspace();

  const filteredMemberships = useMemo(() => {
    return group.projectMemberships.filter(({ project }) => {
      return project.name.toLowerCase().includes(filteredProjectName.toLowerCase());
    });
  }, [filteredProjectName, group]);

  const removeProjectFromGroup = useCallback(async (projectSlug: string) => {
    await deleteGroupFromProject({
      groupSlug,
      projectSlug
    });

    createNotification({
      type: "success",
      text: "Project removed from group"
    });
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
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
                      <Link href={`/project/${project.id}`}>
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
                                Remove group from project
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

export const UserGroupsRow = ({ group, handlePopUpOpen }: Props) => {
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);

  return (
    <>
      <Tr
        className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        key={`user-project-membership-${group.id}`}
        onClick={() => setIsProjectsModalOpen(true)}
      >
        <Td>{group.name}</Td>
        <Td>
          {group.projectMemberships.length} Project
          {group.projectMemberships.length > 1 || group.projectMemberships.length === 0 ? "s" : ""}
        </Td>
        <Td>
          {true && (
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content="Remove user from group">
                <IconButton
                  colorSchema="danger"
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("removeUserFromGroup", {
                      groupSlug: group.slug
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </Tooltip>
            </div>
          )}
        </Td>
      </Tr>
      <GroupProjectsModal
        groupSlug={group.slug}
        isOpen={isProjectsModalOpen}
        setIsOpen={setIsProjectsModalOpen}
        group={group}
      />
    </>
  );
};
