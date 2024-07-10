import Link from "next/link";
import { useRouter } from "next/router";
import { faEllipsis, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
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
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetIdentityMembershipOrgs, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";

export const IdentityTable = () => {
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
                  className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
                  key={`identity-${id}`}
                  onClick={() => router.push(`/org/${orgId}/identities/${id}`)}
                >
                  <Td>
                    <Link href={`/org/${orgId}/identities/${id}`}>{name}</Link>
                  </Td>
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
                    <div className="flex items-center justify-end space-x-4">
                      <IconButton
                        ariaLabel="copy icon"
                        variant="plain"
                        className="group relative"
                        onClick={() => router.push(`/org/${orgId}/identities/${id}`)}
                      >
                        <FontAwesomeIcon icon={faEllipsis} />
                      </IconButton>
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
