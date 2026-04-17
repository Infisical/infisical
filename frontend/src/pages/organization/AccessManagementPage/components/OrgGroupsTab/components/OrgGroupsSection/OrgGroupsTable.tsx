import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  CopyIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OrgIcon,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SubOrgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetOrganizationGroups, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["group", "deleteGroup", "groupMembers"]>,
    data?: {
      groupId?: string;
      name?: string;
      slug?: string;
      role?: string;
      isLinkedGroup?: boolean;
      customRole?: {
        name: string;
        slug: string;
      };
    }
  ) => void;
};

enum GroupsOrderBy {
  Name = "name",
  Slug = "slug",
  Role = "role"
}

type Filter = {
  roles: string[];
};

export const OrgGroupsTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { isPending, data: groups = [] } = useGetOrganizationGroups(orgId);
  const { mutateAsync: updateMutateAsync } = useUpdateGroup();

  const { data: roles } = useGetOrgRoles(orgId);

  const handleChangeRole = async ({ id, role }: { id: string; role: string }) => {
    await updateMutateAsync({
      id,
      role,
      organizationId: orgId
    });

    createNotification({
      text: "Successfully updated group role",
      type: "success"
    });
  };

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
    setOrderBy,
    setOrderDirection,
    toggleOrderDirection
  } = usePagination<GroupsOrderBy>(GroupsOrderBy.Name, {
    initPerPage: getUserTablePreference("orgGroupsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("orgGroupsTable", PreferenceKey.PerPage, newPerPage);
  };

  const [filter, setFilter] = useState<Filter>({
    roles: []
  });

  const handleRoleToggle = useCallback(
    (roleSlug: string) =>
      setFilter((state) => {
        const currentRoles = state.roles || [];

        if (currentRoles.includes(roleSlug)) {
          return { ...state, roles: currentRoles.filter((role) => role !== roleSlug) };
        }
        return { ...state, roles: [...currentRoles, roleSlug] };
      }),
    []
  );

  const isTableFiltered = Boolean(filter.roles.length);

  const filteredGroups = useMemo(() => {
    const filtered = groups?.filter(({ name, slug, role, customRole }) => {
      if (filter.roles.length) {
        const effectiveRole = role === "custom" ? customRole?.slug : role;
        if (!effectiveRole || !filter.roles.includes(effectiveRole)) {
          return false;
        }
      }

      if (search) {
        return (
          name.toLowerCase().includes(search.toLowerCase()) ||
          slug.toLowerCase().includes(search.toLowerCase())
        );
      }
      return true;
    });

    const ordered = filtered?.sort((a, b) => {
      switch (orderBy) {
        case GroupsOrderBy.Role: {
          const aValue = a.role === "custom" ? (a.customRole?.name as string) : a.role;
          const bValue = b.role === "custom" ? (b.customRole?.name as string) : b.role;

          return aValue.toLowerCase().localeCompare(bValue.toLowerCase());
        }
        default:
          return a[orderBy].toLowerCase().localeCompare(b[orderBy].toLowerCase());
      }
    });

    return orderDirection === OrderByDirection.ASC ? ordered : ordered?.reverse();
  }, [search, groups, orderBy, orderDirection, filter]);

  const handleSort = (column: GroupsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  useResetPageHelper({
    totalCount: filteredGroups.length,
    offset,
    setPage
  });

  const filteredGroupsPage = filteredGroups.slice(offset, perPage * page);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${isSubOrganization ? "sub-" : ""}organization groups...`}
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                isTableFiltered ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              Filter by {isSubOrganization ? "Sub-" : ""}Organization Role
            </DropdownMenuLabel>
            {roles?.map(({ id, slug, name }) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={filter.roles.includes(slug)}
                onClick={(e) => {
                  e.preventDefault();
                  handleRoleToggle(slug);
                  setPage(1);
                }}
              >
                {name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isPending && !filteredGroups?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {groups.length
                ? `No ${isSubOrganization ? "sub-" : ""}organization groups match ${search ? "search" : "filter criteria"}`
                : `No ${isSubOrganization ? "sub-" : ""}organization groups found`}
            </EmptyTitle>
            <EmptyDescription>
              {groups.length
                ? "Adjust your search or filter criteria."
                : "Create a group to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3" onClick={() => handleSort(GroupsOrderBy.Name)}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === GroupsOrderBy.Name &&
                        "rotate-180",
                      orderBy !== GroupsOrderBy.Name && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead className="w-1/3" onClick={() => handleSort(GroupsOrderBy.Slug)}>
                  Slug
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === GroupsOrderBy.Slug &&
                        "rotate-180",
                      orderBy !== GroupsOrderBy.Slug && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead
                  className={isSubOrganization ? "w-1/3" : ""}
                  onClick={() => handleSort(GroupsOrderBy.Role)}
                >
                  {isSubOrganization ? "Sub-" : ""}Organization Role
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === GroupsOrderBy.Role &&
                        "rotate-180",
                      orderBy !== GroupsOrderBy.Role && "opacity-30"
                    )}
                  />
                </TableHead>
                {isSubOrganization && <TableHead>Managed By</TableHead>}
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
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
                    {isSubOrganization && (
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    )}
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                filteredGroupsPage.map(
                  ({ id, name, slug, role, customRole, orgId: groupOrgId }) => {
                    const isLinkedGroup = currentOrg ? groupOrgId !== currentOrg.id : false;
                    const isManagedBySubOrg = currentOrg ? groupOrgId === currentOrg.id : false;
                    return (
                      <TableRow
                        key={`org-group-${id}`}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: "/organizations/$orgId/groups/$groupId",
                            params: {
                              orgId,
                              groupId: id
                            }
                          })
                        }
                      >
                        <TableCell isTruncatable>{name}</TableCell>
                        <TableCell isTruncatable>{slug}</TableCell>
                        <TableCell>
                          <OrgPermissionCan
                            I={OrgPermissionGroupActions.Edit}
                            a={OrgPermissionSubjects.Groups}
                          >
                            {(isAllowed) => (
                              <Select
                                value={role === "custom" ? (customRole?.slug as string) : role}
                                disabled={!isAllowed}
                                onValueChange={(selectedRole) =>
                                  handleChangeRole({
                                    id,
                                    role: selectedRole
                                  })
                                }
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="w-full max-w-32 lg:max-w-64"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-w-32 lg:max-w-64">
                                  {(roles || []).map(({ slug: roleSlug, name: roleName }) => (
                                    <SelectItem value={roleSlug} key={`role-option-${roleSlug}`}>
                                      {roleName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </OrgPermissionCan>
                        </TableCell>
                        {isSubOrganization && (
                          <TableCell>
                            <Badge variant={isManagedBySubOrg ? "sub-org" : "org"}>
                              {isManagedBySubOrg ? (
                                <>
                                  <SubOrgIcon />
                                  Sub-Organization
                                </>
                              ) : (
                                <>
                                  <OrgIcon />
                                  Root Organization
                                </>
                              )}
                            </Badge>
                          </TableCell>
                        )}
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
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(id);
                                  createNotification({
                                    text: "Copied group ID to clipboard",
                                    type: "info"
                                  });
                                }}
                              >
                                <CopyIcon />
                                Copy Group ID
                              </DropdownMenuItem>
                              {!isLinkedGroup && (
                                <OrgPermissionCan
                                  I={OrgPermissionGroupActions.Edit}
                                  a={OrgPermissionSubjects.Groups}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("group", {
                                          groupId: id,
                                          name,
                                          slug,
                                          role,
                                          customRole
                                        });
                                      }}
                                      isDisabled={!isAllowed}
                                    >
                                      <PencilIcon />
                                      Edit Group
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              {!isLinkedGroup && (
                                <OrgPermissionCan
                                  I={OrgPermissionGroupActions.Edit}
                                  a={OrgPermissionSubjects.Groups}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        navigate({
                                          to: "/organizations/$orgId/groups/$groupId",
                                          params: {
                                            orgId,
                                            groupId: id
                                          }
                                        })
                                      }
                                      isDisabled={!isAllowed}
                                    >
                                      <UsersIcon />
                                      Manage Members
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              <OrgPermissionCan
                                I={OrgPermissionGroupActions.Delete}
                                a={OrgPermissionSubjects.Groups}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    variant="danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteGroup", {
                                        groupId: id,
                                        name,
                                        isLinkedGroup
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <TrashIcon />
                                    {isLinkedGroup ? "Unlink Group" : "Delete Group"}
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  }
                )}
            </TableBody>
          </Table>
          {Boolean(filteredGroups.length) && (
            <Pagination
              count={filteredGroups.length}
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
