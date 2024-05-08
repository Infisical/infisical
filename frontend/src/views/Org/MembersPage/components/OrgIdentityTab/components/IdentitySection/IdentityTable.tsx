import {
  faCopy,
  faEllipsis,
  faKey,
  faLock,
  faPencil,
  faServer,
  faXmark
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
  Select,
  SelectItem,
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
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetIdentityMembershipOrgs, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

// TODO: some kind of map

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["deleteIdentity", "identity", "universalAuthClientSecret", "identityAuthMethod"]
    >,
    data?: {
      identityId?: string;
      name?: string;
      authMethod?: string;
      role?: string;
      customRole?: {
        name: string;
        slug: string;
      };
    }
  ) => void;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
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
            <Th>Auth Method</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="org-identities" />}
          {!isLoading &&
            data &&
            data.length > 0 &&
            data.map(({ identity: { id, name, authMethod }, role, customRole }) => {
              return (
                <Tr className="h-10" key={`identity-${id}`}>
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
                  <Td>{authMethod ? identityAuthToNameMap[authMethod] : "Not configured"}</Td>
                  <Td>
                    <div className="flex items-center justify-end space-x-4">
                      {authMethod === IdentityAuthMethod.UNIVERSAL_AUTH && (
                        <Tooltip content="Manage client ID/secrets">
                          <IconButton
                            onClick={async () => {
                              handlePopUpOpen("universalAuthClientSecret", {
                                identityId: id,
                                name
                              });
                            }}
                            size="lg"
                            colorSchema="primary"
                            variant="plain"
                            ariaLabel="update"
                          >
                            <FontAwesomeIcon icon={faKey} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
                        a={OrgPermissionSubjects.Identity}
                      >
                        {(isAllowed) => (
                          <Tooltip content="Manage auth method">
                            <IconButton
                              onClick={async () => {
                                handlePopUpOpen("identityAuthMethod", {
                                  identityId: id,
                                  name,
                                  authMethod
                                });
                              }}
                              size="lg"
                              colorSchema="primary"
                              variant="plain"
                              ariaLabel="update"
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faLock} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </OrgPermissionCan>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
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
                                onClick={async () => {
                                  if (!isAllowed) return;
                                  handlePopUpOpen("identity", {
                                    identityId: id,
                                    name,
                                    role,
                                    customRole
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faPencil} />}
                              >
                                Update identity
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
                                onClick={() => {
                                  if (!isAllowed) return;
                                  handlePopUpOpen("deleteIdentity", {
                                    identityId: id,
                                    name
                                  });
                                }}
                                icon={<FontAwesomeIcon icon={faXmark} />}
                              >
                                Delete identity
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(id);
                              createNotification({
                                text: "Copied identity internal ID to clipboard",
                                type: "success"
                              });
                            }}
                            icon={<FontAwesomeIcon icon={faCopy} />}
                          >
                            Copy Identity ID
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
