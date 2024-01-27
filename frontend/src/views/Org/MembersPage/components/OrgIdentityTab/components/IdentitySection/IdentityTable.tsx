import { faKey, faLock, faPencil, faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import {
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
  const { createNotification } = useNotificationContext();
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
            <Th>ID</Th>
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
                  <Td>{id}</Td>
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
                    <div className="flex items-center justify-end">
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
                            // isDisabled={!isAllowed}
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
                              className="ml-4"
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faLock} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </OrgPermissionCan>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
                        a={OrgPermissionSubjects.Identity}
                      >
                        {(isAllowed) => (
                          <IconButton
                            onClick={async () => {
                              handlePopUpOpen("identity", {
                                identityId: id,
                                name,
                                role,
                                customRole
                              });
                            }}
                            size="lg"
                            colorSchema="primary"
                            variant="plain"
                            ariaLabel="update"
                            className="ml-4"
                            isDisabled={!isAllowed}
                          >
                            <FontAwesomeIcon icon={faPencil} />
                          </IconButton>
                        )}
                      </OrgPermissionCan>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        a={OrgPermissionSubjects.Identity}
                      >
                        {(isAllowed) => (
                          <IconButton
                            onClick={() => {
                              handlePopUpOpen("deleteIdentity", {
                                identityId: id,
                                name
                              });
                            }}
                            size="lg"
                            colorSchema="danger"
                            variant="plain"
                            ariaLabel="update"
                            className="ml-4"
                            isDisabled={!isAllowed}
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </IconButton>
                        )}
                      </OrgPermissionCan>
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
