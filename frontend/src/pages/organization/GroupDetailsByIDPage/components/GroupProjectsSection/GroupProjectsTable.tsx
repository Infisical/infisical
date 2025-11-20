import {
  faArrowDown,
  faArrowUp,
  faFolder,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListGroupProjects } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { EFilterReturnedProjects } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupProjectRow } from "./GroupProjectRow";

type Props = {
  groupId: string;
  groupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeProjectFromGroup", "addGroupProjects"]>,
    data?: object
  ) => void;
};

enum GroupProjectsOrderBy {
  Name = "name"
}

export const GroupProjectsTable = ({ groupId, groupSlug, handlePopUpOpen }: Props) => {
  const {
    search,
    debouncedSearch,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    toggleOrderDirection
  } = usePagination(GroupProjectsOrderBy.Name, {
    initPerPage: getUserTablePreference("groupProjectsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("groupProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: groupMemberships, isPending } = useListGroupProjects({
    id: groupId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    orderBy,
    orderDirection,
    filter: EFilterReturnedProjects.ASSIGNED_PROJECTS
  });

  const totalCount = groupMemberships?.totalCount ?? 0;
  const isEmpty = !isPending && totalCount === 0;
  const projects = groupMemberships?.projects ?? [];

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search projects..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className="ml-2"
                    ariaLabel="sort"
                    onClick={toggleOrderDirection}
                  >
                    <FontAwesomeIcon
                      icon={orderDirection === OrderByDirection.DESC ? faArrowUp : faArrowDown}
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>Type</Th>
              <Th>Added On</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="group-project-memberships" />}
            {!isPending &&
              projects.map((project) => {
                return (
                  <GroupProjectRow
                    key={`group-project-${project.id}`}
                    project={project}
                    handlePopUpOpen={handlePopUpOpen}
                  />
                );
              })}
          </TBody>
        </Table>
        {!isEmpty && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {isEmpty && (
          <EmptyState
            title={
              groupMemberships?.projects.length
                ? "No projects match this search..."
                : "This group is not a part of any projects yet"
            }
            icon={groupMemberships?.projects.length ? faSearch : faFolder}
          />
        )}
        {!groupMemberships?.projects.length && (
          <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
            {(isAllowed) => (
              <div className="mb-4 flex items-center justify-center">
                <Button
                  variant="solid"
                  colorSchema="secondary"
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("addGroupProjects", {
                      groupId,
                      slug: groupSlug
                    });
                  }}
                >
                  Add projects
                </Button>
              </div>
            )}
          </OrgPermissionCan>
        )}
      </TableContainer>
    </div>
  );
};
