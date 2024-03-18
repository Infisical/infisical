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
  useUser,
  useWorkspace
} from "@app/context";
import {
  useAddUserToOrg,
  useFetchServerStatus,
  useGetOrgRoles,
  useGetOrgUsersWithProjects,
  useUpdateOrgUserRole
} from "@app/hooks/api";

import AddProject from "./AddProject";
import ProjectsCell from "./ProjectsCell";
import { OrgMembersTableProps } from "./types";

export const OrgMembersTable = ({
  handlePopUpOpen,
  setCompleteInviteLink
}: OrgMembersTableProps) => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles, isLoading: isRolesLoading } = useGetOrgRoles(orgId);
  const { workspaces } = useWorkspace();

  const [searchMemberFilter, setSearchMemberFilter] = useState("");

  const { data: serverDetails } = useFetchServerStatus();
  const { data: members, isLoading: isMembersLoading } = useGetOrgUsersWithProjects(orgId);

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
          u?.firstName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          u?.lastName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          u?.username?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          u?.email?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          inviteEmail?.includes(searchMemberFilter.toLowerCase())
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
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Projects</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={5} innerKey="org-members" />}
            {!isLoading &&
              filterdUser?.map(
                ({ user: u, inviteEmail, role, roleId, id: orgMembershipId, status, projects }) => {
                  const name = u && u.firstName ? `${u.firstName} ${u.lastName}` : "-";
                  const email = u?.email || inviteEmail;

                  const username = u?.username ?? inviteEmail ?? "-";

                  const availableWorkspaces = workspaces.filter((workspace) => {
                    const workspaceAlreadyExist = projects.join(",").indexOf(workspace.name) >= 0;
                    return !workspaceAlreadyExist;
                  });

                  const hasMoreProjectsToAdd = Boolean(availableWorkspaces.length);

                  return (
                    <Tr key={`org-membership-${orgMembershipId}`} className="w-full">
                      <Td>{name}</Td>
                      <Td>{username}</Td>
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Member}
                        >
                          {(isAllowed) => (
                            <>
                              {status === "accepted" && (
                                <Select
                                  value={role === "custom" ? findRoleFromId(roleId)?.slug : role}
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
                                email &&
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
                      <Td className="flex items-center">
                        <ProjectsCell projects={projects} />
                        {hasMoreProjectsToAdd && (
                          <AddProject
                            handlePopUpOpen={handlePopUpOpen}
                            createNotification={createNotification}
                            currentOrg={currentOrg}
                            orgMembershipId={orgMembershipId}
                            email={email}
                            projects={projects}
                          />
                        )}
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
                                  if (currentOrg?.authEnforced) {
                                    createNotification({
                                      text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
                                      type: "error"
                                    });
                                    return;
                                  }

                                  handlePopUpOpen("removeMember", { orgMembershipId, username });
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
