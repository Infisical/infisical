import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faEllipsisV,
  faMagnifyingGlass,
  faSearch,
  faUsers,
  faUsersSlash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListWorkspaceGroups } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupRoles } from "./GroupRoles";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteGroup", "group"]>,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

enum GroupsOrderBy {
  Name = "name"
}

export const GroupTable = ({ handlePopUpOpen }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    toggleOrderDirection
  } = usePagination(GroupsOrderBy.Name, {
    initPerPage: getUserTablePreference("projectGroupsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectGroupsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: groupMemberships = [], isPending } = useListWorkspaceGroups(
    currentProject?.id || ""
  );

  const filteredGroupMemberships = useMemo(() => {
    const filtered = search
      ? groupMemberships?.filter(
          ({ group: { name, slug } }) =>
            name.toLowerCase().includes(search.toLowerCase()) ||
            slug.toLowerCase().includes(search.toLowerCase())
        )
      : groupMemberships;

    const ordered = filtered?.sort((a, b) =>
      a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
    );

    return orderDirection === OrderByDirection.ASC ? ordered : ordered?.reverse();
  }, [search, groupMemberships, orderBy, orderDirection]);

  useResetPageHelper({
    totalCount: filteredGroupMemberships.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search project groups..."
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
              <Th>Project Role</Th>
              <Th>Added on</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="project-groups" />}
            {!isPending &&
              filteredGroupMemberships &&
              filteredGroupMemberships.length > 0 &&
              filteredGroupMemberships
                .slice(offset, perPage * page)
                .map(({ group: { id, name, orgId: groupOrgId }, roles, createdAt }) => {
                  const isInherited =
                    groupOrgId != null && currentOrg != null && groupOrgId !== currentOrg.id;
                  return (
                    <Tr
                      className="group h-10 w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`st-v3-${id}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") {
                          navigate({
                            to: `${getProjectBaseURL(currentProject.type)}/groups/$groupId` as const,
                            params: {
                              orgId: currentOrg.id,
                              projectId: currentProject.id,
                              groupId: id
                            }
                          });
                        }
                      }}
                      onClick={() =>
                        navigate({
                          to: `${getProjectBaseURL(currentProject.type)}/groups/$groupId` as const,
                          params: {
                            orgId: currentOrg.id,
                            projectId: currentProject.id,
                            groupId: id
                          }
                        })
                      }
                    >
                      <Td>{name}</Td>
                      <Td>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.Groups}
                        >
                          {(isAllowed) => (
                            <GroupRoles
                              roles={roles}
                              disableEdit={!isAllowed || isInherited}
                              groupId={id}
                            />
                          )}
                        </ProjectPermissionCan>
                      </Td>
                      <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                      <Td className="flex justify-end">
                        <Tooltip className="max-w-sm text-center" content="Options">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                ariaLabel="Options"
                                colorSchema="secondary"
                                className="w-6"
                                variant="plain"
                              >
                                <FontAwesomeIcon icon={faEllipsisV} />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              {!isInherited && (
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Groups}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      icon={<FontAwesomeIcon icon={faUsersSlash} />}
                                      isDisabled={!isAllowed}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteGroup", {
                                          id,
                                          name
                                        });
                                      }}
                                    >
                                      Remove Group From Project
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Tooltip>
                      </Td>
                    </Tr>
                  );
                })}
          </TBody>
        </Table>
        {Boolean(filteredGroupMemberships.length) && (
          <Pagination
            count={filteredGroupMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredGroupMemberships?.length && (
          <EmptyState
            title={
              groupMemberships.length
                ? "No project groups match search..."
                : "No project groups found"
            }
            icon={groupMemberships.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
