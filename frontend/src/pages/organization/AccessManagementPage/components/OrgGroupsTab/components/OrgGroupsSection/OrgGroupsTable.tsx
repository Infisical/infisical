import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faEllipsis,
  faMagnifyingGlass,
  faSearch,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
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

export const OrgGroupsTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { isPending, data: groups = [] } = useGetOrganizationGroups(orgId);
  const { mutateAsync: updateMutateAsync } = useUpdateGroup();

  const { data: roles } = useGetOrgRoles(orgId);

  const handleChangeRole = async ({ id, role }: { id: string; role: string }) => {
    try {
      await updateMutateAsync({
        id,
        role
      });

      createNotification({
        text: "Successfully updated group role",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update group role",
        type: "error"
      });
    }
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

  const filteredGroups = useMemo(() => {
    const filtered = search
      ? groups?.filter(
          ({ name, slug }) =>
            name.toLowerCase().includes(search.toLowerCase()) ||
            slug.toLowerCase().includes(search.toLowerCase())
        )
      : groups;

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
  }, [search, groups, orderBy, orderDirection]);

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

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search groups..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === GroupsOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(GroupsOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === GroupsOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Slug
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === GroupsOrderBy.Slug ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(GroupsOrderBy.Slug)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === GroupsOrderBy.Slug
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Role
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === GroupsOrderBy.Role ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(GroupsOrderBy.Role)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === GroupsOrderBy.Role
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="org-groups" />}
            {!isPending &&
              filteredGroups
                .slice(offset, perPage * page)
                .map(({ id, name, slug, role, customRole }) => {
                  return (
                    <Tr
                      onClick={() =>
                        navigate({
                          to: "/organization/groups/$groupId",
                          params: {
                            groupId: id
                          }
                        })
                      }
                      className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`org-group-${id}`}
                    >
                      <Td>{name}</Td>
                      <Td>{slug}</Td>
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionGroupActions.Edit}
                          a={OrgPermissionSubjects.Groups}
                        >
                          {(isAllowed) => {
                            return (
                              <Select
                                value={role === "custom" ? (customRole?.slug as string) : role}
                                isDisabled={!isAllowed}
                                className="w-48 bg-mineshaft-600"
                                dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                onValueChange={(selectedRole) =>
                                  handleChangeRole({
                                    id,
                                    role: selectedRole
                                  })
                                }
                              >
                                {(roles || []).map(({ slug: roleSlug, name: roleName }) => (
                                  <SelectItem value={roleSlug} key={`role-option-${roleSlug}`}>
                                    {roleName}
                                  </SelectItem>
                                ))}
                              </Select>
                            );
                          }}
                        </OrgPermissionCan>
                      </Td>
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild className="rounded-lg">
                            <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                              <FontAwesomeIcon size="sm" icon={faEllipsis} />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="p-1">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                createNotification({
                                  text: "Copied group ID to clipboard",
                                  type: "info"
                                });
                                navigator.clipboard.writeText(id);
                              }}
                            >
                              Copy Group ID
                            </DropdownMenuItem>
                            <OrgPermissionCan
                              I={OrgPermissionGroupActions.Edit}
                              a={OrgPermissionSubjects.Groups}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
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
                                  disabled={!isAllowed}
                                >
                                  Edit Group
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                            <OrgPermissionCan
                              I={OrgPermissionGroupActions.Edit}
                              a={OrgPermissionSubjects.Groups}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={() =>
                                    navigate({
                                      to: "/organization/groups/$groupId",
                                      params: {
                                        groupId: id
                                      }
                                    })
                                  }
                                  disabled={!isAllowed}
                                >
                                  Manage Members
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                            <OrgPermissionCan
                              I={OrgPermissionGroupActions.Delete}
                              a={OrgPermissionSubjects.Groups}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    isAllowed
                                      ? "hover:!bg-red-500 hover:!text-white"
                                      : "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteGroup", {
                                      groupId: id,
                                      name
                                    });
                                  }}
                                  disabled={!isAllowed}
                                >
                                  Delete Group
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                })}
          </TBody>
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
        {!isPending && !filteredGroups?.length && (
          <EmptyState
            title={
              groups.length
                ? "No organization groups match search..."
                : "No organization groups found"
            }
            icon={groups.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
