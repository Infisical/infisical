import { useRouter } from "next/router";
import { faEllipsis, faServer } from "@fortawesome/free-solid-svg-icons";
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
import { useGetIdentityMembershipOrgs, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentity"]>,
    data?: {
      identityId: string;
      name: string;
    }
  ) => void;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();
  const { data, isLoading } = useGetIdentityMembershipOrgs(orgId);

  const { data: roles } = useGetOrgRoles(orgId);

  const handleChangeRole = async ({ identityId, role }: { identityId: string; role: string }) => {
    try {
      await updateMutateAsync({
        identityId,
        role,
        organizationId: orgId
      });

      createNotification({
        text: "Successfully updated identity role",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to update identity role";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="org-identities" />}
          {!isLoading &&
            data?.map(({ identity: { id, name }, role, customRole }) => {
              return (
                <Tr
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  key={`identity-${id}`}
                  onClick={() => router.push(`/org/${orgId}/identities/${id}`)}
                >
                  <Td>{name}</Td>
                  <Td>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.Identity}
                    >
                      {(isAllowed) => {
                        return (
                          <Select
                            value={role === "custom" ? (customRole?.slug as string) : role}
                            isDisabled={!isAllowed}
                            className="w-40 bg-mineshaft-600"
                            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                            onValueChange={(selectedRole) =>
                              handleChangeRole({
                                identityId: id,
                                role: selectedRole
                              })
                            }
                          >
                            {(roles || []).map(({ slug, name: roleName }) => (
                              <SelectItem value={slug} key={`owner-option-${slug}`}>
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
                                router.push(`/org/${orgId}/identities/${id}`);
                              }}
                              disabled={!isAllowed}
                            >
                              Edit Identity
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Delete}
                          a={OrgPermissionSubjects.Identity}
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
                                handlePopUpOpen("deleteIdentity", {
                                  identityId: id,
                                  name
                                });
                              }}
                              disabled={!isAllowed}
                            >
                              Delete Identity
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={4}>
                <EmptyState
                  title="No identities have been created in this organization"
                  icon={faServer}
                />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
