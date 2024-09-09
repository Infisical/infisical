import { useMemo, useState } from "react";
import Link from "next/link";
import { faFolder, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
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

  const filteredMemberships = useMemo(() => {
    if (!popupData?.group) return [];

    return popupData.group.projectMemberships.filter(({ project }) => {
      return project.name.toLowerCase().includes(filteredProjectName.toLowerCase());
    });
  }, [filteredProjectName, popupData?.group?.projectMemberships]);

  return (
    <Modal
      isOpen={popUp.userGroupsProjects.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("userGroupsProjects", open);
      }}
    >
      <ModalContent
        title="View group projects"
        subTitle="View which projects this group has access to"
      >
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
                <Th>Roles</Th>
              </Tr>
            </THead>
            <TBody className="w-full">
              {filteredMemberships?.map(({ project, roles }) => {
                return (
                  <Tr className="" key={`group-project-${project.id}`}>
                    <Td>
                      <Link href={`/project/${project.id}/secrets/overview`}>
                        <p className="cursor-pointer font-medium capitalize transition-all hover:text-primary-500">
                          {project.name}
                        </p>
                      </Link>
                    </Td>
                    <Td>
                      <Tooltip
                        isDisabled={roles.length === 1}
                        content={roles
                          .map((role) => role.role.charAt(0).toUpperCase() + role.role.slice(1))
                          .join(", ")}
                      >
                        <p className="w-fit capitalize">
                          {roles.length === 1
                            ? roles[0].role
                            : `${roles[0].role} (+${roles.length - 1} more)`}
                        </p>
                      </Tooltip>
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
