import { useState } from "react";
import { faEllipsis, faMagnifyingGlass, faUsers } from "@fortawesome/free-solid-svg-icons";
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
import { useGetOrganizationGroups, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
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

export const OrgGroupsTable = ({ handlePopUpOpen }: Props) => {
  const [searchGroupsFilter, setSearchGroupsFilter] = useState("");
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { isLoading, data: groups } = useGetOrganizationGroups(orgId);
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
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Role</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={4} innerKey="org-groups" />}
            {!isLoading &&
              groups?.map(({ id, name, slug, role, customRole }) => {
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
        {groups?.length === 0 && <EmptyState title="No groups found" icon={faUsers} />}
      </TableContainer>
    </div>
  );
};
