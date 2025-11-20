import { useState } from "react";
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
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useAddGroupToWorkspace as useAddProjectToGroup,
  useListGroupProjects
} from "@app/hooks/api";
import { EFilterReturnedProjects } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addGroupProjects"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addGroupProjects"]>,
    state?: boolean
  ) => void;
};

export const AddGroupProjectModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchProjectFilter, setSearchProjectFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchProjectFilter);

  const popUpData = popUp?.addGroupProjects?.data as {
    groupId: string;
    slug: string;
  };

  const offset = (page - 1) * perPage;

  const { data, isPending } = useListGroupProjects({
    id: popUpData?.groupId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    filter: EFilterReturnedProjects.UNASSIGNED_PROJECTS
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addProjectToGroupMutateAsync, isPending: isAdding } = useAddProjectToGroup();

  const handleAddProject = async (projectId: string, projectName: string) => {
    if (!popUpData?.groupId) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    await addProjectToGroupMutateAsync({
      groupId: popUpData.groupId,
      projectId
    });

    createNotification({
      text: `Successfully assigned project ${projectName} to the group`,
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.addGroupProjects?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addGroupProjects", isOpen);
      }}
    >
      <ModalContent title="Add Group Projects">
        <Input
          value={searchProjectFilter}
          onChange={(e) => setSearchProjectFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search projects..."
        />
        <TableContainer className="mt-4">
          <Table>
            <THead>
              <Tr>
                <Th>Project</Th>
                <Th>Type</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={3} innerKey="group-projects" />}
              {!isPending &&
                data?.projects?.map((project) => {
                  return (
                    <Tr className="items-center" key={`group-project-${project.id}`}>
                      <Td>
                        <p>{project.name}</p>
                        {project.description && (
                          <p className="text-sm text-mineshaft-400">{project.description}</p>
                        )}
                      </Td>
                      <Td>
                        <p className="capitalize">{project.type?.replace("-", " ") || "-"}</p>
                      </Td>
                      <Td className="flex justify-end">
                        <OrgPermissionCan
                          I={OrgPermissionGroupActions.Edit}
                          a={OrgPermissionSubjects.Groups}
                        >
                          {(isAllowed) => {
                            return (
                              <Button
                                isLoading={isAdding}
                                isDisabled={!isAllowed}
                                colorSchema="primary"
                                variant="outline_bg"
                                type="submit"
                                onClick={() => handleAddProject(project.id, project.name)}
                              >
                                Assign
                              </Button>
                            );
                          }}
                        </OrgPermissionCan>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
          {!isPending && !data?.projects?.length && (
            <EmptyState
              title={
                debouncedSearch
                  ? "No projects match search"
                  : "All projects are already assigned to the group"
              }
              icon={faFolder}
            />
          )}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
