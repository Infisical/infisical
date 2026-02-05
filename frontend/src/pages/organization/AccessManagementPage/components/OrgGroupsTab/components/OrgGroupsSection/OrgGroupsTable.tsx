import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCopy,
  faEdit,
  faEllipsisV,
  faMagnifyingGlass,
  faSearch,
  faTrash,
  faUserGroup,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

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
      isInherited?: boolean;
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
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { isPending, data: groups = [] } = useGetOrganizationGroups(orgId);
  const { mutateAsync: updateMutateAsync } = useUpdateGroup();

  const { data: roles } = useGetOrgRoles(orgId);

  const handleChangeRole = async ({ id, role }: { id: string; role: string }) => {
    await updateMutateAsync({
      id,
      role
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
        placeholder={`Search ${isSubOrganization ? "sub-" : ""}organization groups...`}
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
                  {isSubOrganization ? "Sub-" : ""}Organization Role
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
                .map(({ id, name, slug, role, customRole, orgId: groupOrgId }) => {
                  return (
                    <Tr
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/groups/$groupId",
                          params: {
                            orgId,
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
                                className="h-8 w-48 bg-mineshaft-700"
                                position="popper"
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
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              ariaLabel="Options"
                              className="w-6"
                              colorSchema="secondary"
                              variant="plain"
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem
                              icon={<FontAwesomeIcon icon={faCopy} />}
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
                                  icon={<FontAwesomeIcon icon={faEdit} />}
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
                                  icon={<FontAwesomeIcon icon={faUserGroup} />}
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
                                  Manage Members
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                            <OrgPermissionCan
                              I={OrgPermissionGroupActions.Delete}
                              a={OrgPermissionSubjects.Groups}
                            >
                              {(isAllowed) => {
                                const isInherited = currentOrg
                                  ? groupOrgId !== currentOrg.id
                                  : false;
                                return (
                                  <DropdownMenuItem
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteGroup", {
                                        groupId: id,
                                        name,
                                        isInherited
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    {isInherited ? "Unlink Group" : "Delete Group"}
                                  </DropdownMenuItem>
                                );
                              }}
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
                ? `No ${isSubOrganization ? "sub-" : ""}organization groups match search...`
                : `No ${isSubOrganization ? "sub-" : ""}organization groups found`
            }
            icon={groups.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
