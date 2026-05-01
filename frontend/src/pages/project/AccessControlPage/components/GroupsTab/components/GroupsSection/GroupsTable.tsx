import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronDownIcon, MoreHorizontalIcon, SearchIcon, UserRoundXIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {search ? "No project groups match search" : "No project groups found"}
            </EmptyTitle>
            <EmptyDescription>
              {search ? "Adjust your search criteria." : "Add a group to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3" onClick={toggleOrderDirection}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC && "rotate-180"
                    )}
                  />
                </TableHead>
                <TableHead>Project Role</TableHead>
                <TableHead>Added on</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                filteredGroupMembershipsPage.map(
                  ({ group: { id, name, orgId: groupOrgId }, roles, createdAt }) => {
                    const isLinkedGroup =
                      groupOrgId != null && currentOrg != null && groupOrgId !== currentOrg.id;
                    return (
                      <TableRow
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
                        <TableCell isTruncatable>{name}</TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>{format(new Date(createdAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              {!isLinkedGroup && (
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Groups}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
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
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  }
                )}
            </TableBody>
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
        </>
      )}
    </div>
  );
};
