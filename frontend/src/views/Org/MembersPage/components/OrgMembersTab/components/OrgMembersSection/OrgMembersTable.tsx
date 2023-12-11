import { useCallback, useMemo, useState } from "react";
import { faMagnifyingGlass, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
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
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import {
  useAddUserToOrg,
  useFetchServerStatus,
  useGetOrgUsers,
  useGetRoles,
  useUpdateOrgUserRole
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMember", "upgradePlan"]>,
    data?: {
      orgMembershipId?: string;
      email?: string;
      description?: string;
    }
  ) => void;
  setCompleteInviteLink: (link: string) => void;
};

export const OrgMembersTable = ({ handlePopUpOpen, setCompleteInviteLink }: Props) => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles, isLoading: isRolesLoading } = useGetRoles({
    orgId
  });

  const [searchMemberFilter, setSearchMemberFilter] = useState("");

  const { data: serverDetails } = useFetchServerStatus();
  const { data: members, isLoading: isMembersLoading } = useGetOrgUsers(orgId);

  const { mutateAsync: addUserMutateAsync } = useAddUserToOrg();
  const { mutateAsync: updateUserOrgRole } = useUpdateOrgUserRole();

  const onRoleChange = async (membershipId: string, role: string) => {
    if (!currentOrg?.id) return;

    try {
      // TODO: replace hardcoding default role
      const isCustomRole = !["admin", "member"].includes(role);

      if (isCustomRole && subscription && !subscription?.rbac) {
        handlePopUpOpen("upgradePlan", {
          description: "You can assign custom roles to members if you upgrade your Infisical plan."
        });
        return;
      }

      await updateUserOrgRole({
        organizationId: currentOrg?.id,
        membershipId,
        role
      });

      createNotification({
        text: "Successfully updated user role",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update user role",
        type: "error"
      });
    }
  };

  const onResendInvite = async (email: string) => {
    try {
      const { data } = await addUserMutateAsync({
        organizationId: orgId,
        inviteeEmail: email
      });

      setCompleteInviteLink(data?.completeInviteLink || "");

      if (!data.completeInviteLink) {
        createNotification({
          text: `Successfully resent invite to ${email}`,
          type: "success"
        });
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to resend invite to ${email}`,
        type: "error"
      });
    }
  };

  const isLoading = isMembersLoading || isRolesLoading;

  const isIamOwner = useMemo(
    () => members?.find(({ user: u }) => userId === u?.id)?.role === "owner",
    [userId, members]
  );

  const findRoleFromId = useCallback(
    (roleId: string) => {
      return (roles || []).find(({ id }) => id === roleId);
    },
    [roles]
  );

  const filterdUser = useMemo(
    () =>
      members?.filter(
        ({ user: u, inviteEmail }) =>
          u?.firstName?.toLowerCase().includes(searchMemberFilter) ||
          u?.lastName?.toLowerCase().includes(searchMemberFilter) ||
          u?.email?.toLowerCase().includes(searchMemberFilter) ||
          inviteEmail?.includes(searchMemberFilter)
      ),
    [members, searchMemberFilter]
  );

  return (
    <div>
      <Input
        value={searchMemberFilter}
        onChange={(e) => setSearchMemberFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={5} innerKey="org-members" />}
            {!isLoading &&
              filterdUser?.map(
                ({ user: u, inviteEmail, role, customRole, id: orgMembershipId, status }) => {
                  const name = u ? `${u.firstName} ${u.lastName}` : "-";
                  const email = u?.email || inviteEmail;
                  return (
                    <Tr key={`org-membership-${orgMembershipId}`} className="w-full">
                      <Td>{name}</Td>
                      <Td>{email}</Td>
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Member}
                        >
                          {(isAllowed) => (
                            <>
                              {status === "accepted" && (
                                <Select
                                  value={
                                    role === "custom" ? findRoleFromId(customRole)?.slug : role
                                  }
                                  isDisabled={userId === u?.id || !isAllowed}
                                  className="w-40 bg-mineshaft-600"
                                  dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                  onValueChange={(selectedRole) =>
                                    onRoleChange(orgMembershipId, selectedRole)
                                  }
                                >
                                  {(roles || [])
                                    .filter(({ slug }) =>
                                      slug === "owner" ? isIamOwner || role === "owner" : true
                                    )
                                    .map(({ slug, name: roleName }) => (
                                      <SelectItem value={slug} key={`owner-option-${slug}`}>
                                        {roleName}
                                      </SelectItem>
                                    ))}
                                </Select>
                              )}
                              {(status === "invited" || status === "verified") &&
                                serverDetails?.emailConfigured && (
                                  <Button
                                    isDisabled={!isAllowed}
                                    className="w-40"
                                    colorSchema="primary"
                                    variant="outline_bg"
                                    onClick={() => onResendInvite(email)}
                                  >
                                    Resend Invite
                                  </Button>
                                )}
                            </>
                          )}
                        </OrgPermissionCan>
                      </Td>
                      <Td>
                        {userId !== u?.id && (
                          <OrgPermissionCan
                            I={OrgPermissionActions.Delete}
                            a={OrgPermissionSubjects.Member}
                          >
                            {(isAllowed) => (
                              <IconButton
                                onClick={() => {
                                  handlePopUpOpen("removeMember", { orgMembershipId, email });
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
                        )}
                      </Td>
                    </Tr>
                  );
                }
              )}
          </TBody>
        </Table>
        {!isLoading && filterdUser?.length === 0 && (
          <EmptyState title="No project members found" icon={faUsers} />
        )}
      </TableContainer>
    </div>
  );
};
