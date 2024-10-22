import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faEllipsis,
  faMagnifyingGlass,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
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
  const [searchGroupsFilter, setSearchGroupsFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchGroupsFilter.trim());
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { isLoading, data: groups } = useGetOrganizationGroups(orgId);
  const { mutateAsync: updateMutateAsync } = useUpdateGroup();
  const [orderBy, setOrderBy] = useState(GroupsOrderBy.Name);
  const [orderDirection, setOrderDirection] = useState(OrderByDirection.ASC);

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

  const filteredGroups = useMemo(() => {
    const filtered = debouncedSearch
      ? groups?.filter(
          ({ name, slug }) =>
            name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            slug.toLowerCase().includes(debouncedSearch.toLowerCase())
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
  }, [debouncedSearch, groups, orderBy, orderDirection]);

  const handleSort = (column: GroupsOrderBy) => {
    if (column === orderBy) {
      setOrderDirection((prev) =>
        prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
      );
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  return (
    <div>
      <Input
        value={searchGroupsFilter}
        onChange={(e) => setSearchGroupsFilter(e.target.value)}
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
            {isLoading && <TableSkeleton columns={4} innerKey="org-groups" />}
            {!isLoading &&
              filteredGroups?.map(({ id, name, slug, role, customRole }) => {
                return (
                  <Tr className="h-10" key={`org-group-${id}`}>
                    <Td>{name}</Td>
                    <Td>{slug}</Td>
                    <Td>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
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
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("groupMembers", {
                                    groupId: id,
                                    slug
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                Manage Users
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
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
                            I={OrgPermissionActions.Delete}
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
        {filteredGroups?.length === 0 && (
          <EmptyState
            title={groups?.length === 0 ? "No groups found" : "No groups match search"}
            icon={faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
