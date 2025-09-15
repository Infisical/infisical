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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListWorkspaceIdentityGroups } from "@app/hooks/api/workspace/queries";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityGroupRoles } from "./IdentityGroupRoles";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentityGroup", "group"]>,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

enum IdentityGroupsOrderBy {
  Name = "name"
}

export const IdentityGroupsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
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
  } = usePagination(IdentityGroupsOrderBy.Name, {
    initPerPage: getUserTablePreference("projectIdentityGroupsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectIdentityGroupsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: identityGroupMemberships = [], isPending } = useListWorkspaceIdentityGroups(
    currentWorkspace?.id || ""
  );

  const filteredIdentityGroupMemberships = useMemo(() => {
    const filtered = search
      ? identityGroupMemberships?.filter(
          ({ group: { name, slug } }) =>
            name.toLowerCase().includes(search.toLowerCase()) ||
            slug.toLowerCase().includes(search.toLowerCase())
        )
      : identityGroupMemberships;

    const ordered = filtered?.sort((a, b) =>
      a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
    );

    return orderDirection === OrderByDirection.ASC ? ordered : ordered?.reverse();
  }, [search, identityGroupMemberships, orderBy, orderDirection]);

  useResetPageHelper({
    totalCount: filteredIdentityGroupMemberships.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search identity groups..."
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
              <Th>Role</Th>
              <Th>Added on</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="project-groups" />}
            {!isPending &&
              filteredIdentityGroupMemberships &&
              filteredIdentityGroupMemberships.length > 0 &&
              filteredIdentityGroupMemberships
                .slice(offset, perPage * page)
                .map(({ group: { id, name }, roles, createdAt }) => {
                  return (
                    <Tr
                      className="group h-10 w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`st-v3-${id}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") {
                          navigate({
                            to: `${getProjectBaseURL(currentWorkspace.type)}/identity-groups/$identityGroupId` as const,
                            params: {
                              projectId: currentWorkspace.id,
                              identityGroupId: id
                            }
                          });
                        }
                      }}
                      onClick={() =>
                        navigate({
                          to: `${getProjectBaseURL(currentWorkspace.type)}/identity-groups/$identityGroupId` as const,
                          params: {
                            projectId: currentWorkspace.id,
                            identityGroupId: id
                          }
                        })
                      }
                    >
                      <Td>{name}</Td>
                      <Td>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.IdentityGroups}
                        >
                          {(isAllowed) => (
                            <IdentityGroupRoles
                              roles={roles}
                              disableEdit={!isAllowed}
                              identityGroupId={id}
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
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Delete}
                                a={ProjectPermissionSub.IdentityGroups}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    icon={<FontAwesomeIcon icon={faUsersSlash} />}
                                    isDisabled={!isAllowed}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteIdentityGroup", {
                                        id,
                                        name
                                      });
                                    }}
                                  >
                                    Remove Identity Group From Project
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Tooltip>
                      </Td>
                    </Tr>
                  );
                })}
          </TBody>
        </Table>
        {Boolean(filteredIdentityGroupMemberships.length) && (
          <Pagination
            count={filteredIdentityGroupMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredIdentityGroupMemberships?.length && (
          <EmptyState
            title={
              identityGroupMemberships.length
                ? "No project identity groups match search..."
                : "No project identity groups found"
            }
            icon={identityGroupMemberships.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
