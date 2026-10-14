import { useState } from "react";
import { SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useAddGroupToWorkspace as useAddProjectToGroup,
  useListGroupProjects
} from "@app/hooks/api";
import { FilterReturnedProjects } from "@app/hooks/api/groups/types";
import { ProjectType } from "@app/hooks/api/projects/types";
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
    filter: FilterReturnedProjects.UNASSIGNED_PROJECTS
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addProjectToGroupMutateAsync, isPending: isAdding } = useAddProjectToGroup();

  const handleAddProject = async (projectId: string, projectName: string, projectType?: string) => {
    if (!popUpData?.groupId) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    await addProjectToGroupMutateAsync({
      groupId: popUpData.groupId,
      projectId,
      projectType,
      role: "no-access"
    });

    createNotification({
      text: `Successfully assigned the group to project ${projectName}`,
      type: "success"
    });
  };

  return (
    <Sheet
      open={popUp?.addGroupProjects?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addGroupProjects", isOpen);
      }}
    >
      <SheetContent size="form" isPending={isAdding}>
        <SheetHeader>
          <SheetTitle>Add Projects</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={searchProjectFilter}
              onChange={(e) => setSearchProjectFilter(e.target.value)}
              placeholder="Search projects..."
            />
          </InputGroup>
          {!isPending && !data?.projects?.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {debouncedSearch
                    ? "No projects match search"
                    : "This group is already a part of all projects"}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead variant="action" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending && <TableSkeletonRows columns={3} />}
                  {!isPending &&
                    data?.projects?.map((project) => (
                      <TableRow key={`group-project-${project.id}`}>
                        <TableCell isWrappable>
                          <p>{project.name}</p>
                          {project.description && (
                            <p className="text-xs text-muted">{project.description}</p>
                          )}
                        </TableCell>
                        <TableCell>{getProjectTitle(project.type as ProjectType)}</TableCell>
                        <TableCell variant="action">
                          <OrgPermissionCan
                            I={OrgPermissionGroupActions.Edit}
                            a={OrgPermissionSubjects.Groups}
                          >
                            {(isAllowed) => (
                              <Button
                                variant="outline"
                                size="xs"
                                isPending={isAdding}
                                isDisabled={!isAllowed}
                                onClick={() =>
                                  handleAddProject(project.id, project.name, project.type)
                                }
                              >
                                Assign
                              </Button>
                            )}
                          </OrgPermissionCan>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
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
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
