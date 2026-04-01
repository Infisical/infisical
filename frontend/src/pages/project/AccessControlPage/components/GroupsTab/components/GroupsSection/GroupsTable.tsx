import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronDownIcon, MoreHorizontalIcon, SearchIcon, UserRoundXIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
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

  const filteredGroupMembershipsPage = filteredGroupMemberships.slice(offset, perPage * page);

  return (
    <div>
      <div className="mb-4">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project groups..."
          />
        </InputGroup>
      </div>
      {!isPending && !filteredGroupMemberships?.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {search ? "No project groups match search" : "No project groups found"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {search ? "Adjust your search criteria." : "Add a group to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead className="w-1/3" onClick={toggleOrderDirection}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC && "rotate-180"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead>Project Role</UnstableTableHead>
                <UnstableTableHead>Added on</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <UnstableTableRow key={`skeleton-${i + 1}`}>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-4" />
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              {!isPending &&
                filteredGroupMembershipsPage.map(
                  ({ group: { id, name, orgId: groupOrgId }, roles, createdAt }) => {
                    const isLinkedGroup =
                      groupOrgId != null && currentOrg != null && groupOrgId !== currentOrg.id;
                    return (
                      <UnstableTableRow
                        className="group cursor-pointer"
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
                        <UnstableTableCell isTruncatable>{name}</UnstableTableCell>
                        <UnstableTableCell>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Groups}
                          >
                            {(isAllowed) => (
                              <GroupRoles
                                roles={roles}
                                disableEdit={!isAllowed || isLinkedGroup}
                                groupId={id}
                                groupName={name}
                              />
                            )}
                          </ProjectPermissionCan>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          {format(new Date(createdAt), "MMM d, yyyy")}
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <UnstableDropdownMenu>
                            <UnstableDropdownMenuTrigger asChild>
                              <UnstableIconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </UnstableIconButton>
                            </UnstableDropdownMenuTrigger>
                            <UnstableDropdownMenuContent sideOffset={2} align="end">
                              {!isLinkedGroup && (
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Groups}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
                                      variant="danger"
                                      isDisabled={!isAllowed}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteGroup", {
                                          id,
                                          name
                                        });
                                      }}
                                    >
                                      <UserRoundXIcon />
                                      Remove Group From Project
                                    </UnstableDropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              )}
                            </UnstableDropdownMenuContent>
                          </UnstableDropdownMenu>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  }
                )}
            </UnstableTableBody>
          </UnstableTable>
          {Boolean(filteredGroupMemberships.length) && (
            <UnstablePagination
              count={filteredGroupMemberships.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </>
      )}
    </div>
  );
};
