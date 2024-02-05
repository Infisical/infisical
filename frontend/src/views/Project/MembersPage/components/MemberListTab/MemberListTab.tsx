import { useCallback, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { faMagnifyingGlass, faPlus, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useSubscription,
  useUser,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useAddUserToWsE2EE,
  useAddUserToWsNonE2EE,
  useDeleteUserFromWorkspace,
  useGetOrgUsers,
  useGetProjectRoles,
  useGetUserWsKey,
  useGetWorkspaceUsers,
  useUpdateUserWorkspaceRole,
  useUploadWsKey
} from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const addMemberFormSchema = z.object({
  orgMembershipId: z.string().trim()
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

export const MemberListTab = () => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { t } = useTranslation();

  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();

  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";
  const workspaceId = currentWorkspace?.id || "";

  const { data: roles, isLoading: isRolesLoading } = useGetProjectRoles(workspaceId);

  const { data: wsKey } = useGetUserWsKey(workspaceId);
  const { data: members, isLoading: isMembersLoading } = useGetWorkspaceUsers(workspaceId);
  const { data: orgUsers } = useGetOrgUsers(orgId);

  const [searchMemberFilter, setSearchMemberFilter] = useState("");

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan"
  ] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: zodResolver(addMemberFormSchema) });

  const { mutateAsync: addUserToWorkspace } = useAddUserToWsE2EE();
  const { mutateAsync: addUserToWorkspaceNonE2EE } = useAddUserToWsNonE2EE();
  const { mutateAsync: uploadWsKey } = useUploadWsKey();
  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();
  const { mutateAsync: updateUserWorkspaceRole } = useUpdateUserWorkspaceRole();

  const onAddMember = async ({ orgMembershipId }: TAddMemberForm) => {
    if (!currentWorkspace) return;
    if (!currentOrg?.id) return;
    // TODO(akhilmhdh): Move to memory storage
    const userPrivateKey = localStorage.getItem("PRIVATE_KEY");
    if (!userPrivateKey || !wsKey) {
      createNotification({
        text: "Failed to find private key. Try re-login"
      });
      return;
    }
    const orgUser = (orgUsers || []).find(({ id }) => id === orgMembershipId);
    if (!orgUser) return;

    try {
      if (currentWorkspace.e2ee) {
        await addUserToWorkspace({
          workspaceId,
          userPrivateKey,
          decryptKey: wsKey,
          members: [{ orgMembershipId, userPublicKey: orgUser.user.publicKey }]
        });
      } else {
        await addUserToWorkspaceNonE2EE({
          projectId: workspaceId,
          emails: [orgUser.user.email]
        });
      }
      createNotification({
        text: "Successfully added user to the project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to add user to project",
        type: "error"
      });
    }
    handlePopUpClose("addMember");
    reset();
  };

  const handleRemoveUser = async () => {
    const membershipId = (popUp?.removeMember?.data as { id: string })?.id;
    if (!currentOrg?.id) return;

    try {
      await removeUserFromWorkspace({ workspaceId, membershipId });
      createNotification({
        text: "Successfully removed user from project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove user from the project",
        type: "error"
      });
    }
    handlePopUpClose("removeMember");
  };

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

  const onRoleChange = async (membershipId: string, role: string) => {
    if (!currentOrg?.id) return;

    try {
      const isCustomRole = !Object.values(ProjectMembershipRole).includes(
        role as ProjectMembershipRole
      );

      if (isCustomRole && subscription && !subscription?.rbac) {
        handlePopUpOpen("upgradePlan", {
          description: "You can assign custom roles to members if you upgrade your Infisical plan."
        });
        return;
      }

      await updateUserWorkspaceRole({ membershipId, role, workspaceId });
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

  const filterdUsers = useMemo(
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

  const filteredOrgUsers = useMemo(() => {
    const wsUserEmails = new Map();
    members?.forEach((member) => {
      wsUserEmails.set(member.user.email, true);
    });
    return (orgUsers || []).filter(
      ({ status, user: u }) => status === "accepted" && !wsUserEmails.has(u.email)
    );
  }, [orgUsers, members]);

  const onGrantAccess = async (grantedUserId: string, publicKey: string) => {
    try {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
      if (!PRIVATE_KEY || !wsKey) return;

      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: wsKey.encryptedKey,
        nonce: wsKey.nonce,
        publicKey: wsKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const { ciphertext, nonce } = encryptAssymmetric({
        plaintext: key,
        publicKey,
        privateKey: PRIVATE_KEY
      });

      await uploadWsKey({
        userId: grantedUserId,
        nonce,
        encryptedKey: ciphertext,
        workspaceId: currentWorkspace?.id || ""
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to grant access to user",
        type: "error"
      });
    }
  };

  const isLoading = isMembersLoading || isRolesLoading;

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Members</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("addMember")}
              isDisabled={!isAllowed}
            >
              Add Member
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <Input
        value={searchMemberFilter}
        onChange={(e) => setSearchMemberFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
      <div className="mt-4">
        <TableContainer>
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
              {isLoading && <TableSkeleton columns={4} innerKey="project-members" />}
              {!isLoading &&
                filterdUsers?.map(
                  ({ user: u, inviteEmail, id: membershipId, status, roleId, role }) => {
                    const name = u ? `${u.firstName} ${u.lastName}` : "-";
                    const email = u?.email || inviteEmail;

                    return (
                      <Tr key={`membership-${membershipId}`} className="w-full">
                        <Td>{name}</Td>
                        <Td>{email}</Td>
                        <Td>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Member}
                          >
                            {(isAllowed) => (
                              <>
                                <Select
                                  value={role === "custom" ? findRoleFromId(roleId)?.slug : role}
                                  isDisabled={userId === u?.id || !isAllowed}
                                  className="w-40 bg-mineshaft-600"
                                  dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                  onValueChange={(selectedRole) =>
                                    onRoleChange(membershipId, selectedRole)
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
                                {status === "completed" && user.email !== email && (
                                  <div className="rounded-md border border-mineshaft-700 bg-white/5 text-white duration-200 hover:bg-primary hover:text-black">
                                    <Button
                                      colorSchema="secondary"
                                      isDisabled={!isAllowed}
                                      onClick={() => onGrantAccess(u?.id, u?.publicKey)}
                                    >
                                      Grant Access
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </ProjectPermissionCan>
                        </Td>
                        <Td>
                          {userId !== u?.id && (
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Delete}
                              a={ProjectPermissionSub.Member}
                            >
                              {(isAllowed) => (
                                <IconButton
                                  size="lg"
                                  colorSchema="danger"
                                  variant="plain"
                                  ariaLabel="update"
                                  className="ml-4"
                                  isDisabled={userId === u?.id || !isAllowed}
                                  onClick={() =>
                                    handlePopUpOpen("removeMember", { id: membershipId })
                                  }
                                >
                                  <FontAwesomeIcon icon={faXmark} />
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                          )}
                        </Td>
                      </Tr>
                    );
                  }
                )}
            </TBody>
          </Table>
          {!isLoading && filterdUsers?.length === 0 && (
            <EmptyState title="No project members found" icon={faUsers} />
          )}
        </TableContainer>
      </div>
      <Modal
        isOpen={popUp?.addMember?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addMember", isOpen)}
      >
        <ModalContent
          title={t("section.members.add-dialog.add-member-to-project") as string}
          subTitle={t("section.members.add-dialog.user-will-email")}
        >
          {filteredOrgUsers.length ? (
            <form onSubmit={handleSubmit(onAddMember)}>
              <Controller
                control={control}
                defaultValue={filteredOrgUsers?.[0]?.user?.email}
                name="orgMembershipId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
                    <Select
                      position="popper"
                      className="w-full"
                      defaultValue={filteredOrgUsers?.[0]?.user?.email}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      {filteredOrgUsers.map(({ id: orgUserId, user: u }) => (
                        <SelectItem value={orgUserId} key={`org-membership-join-${orgUserId}`}>
                          {u?.email}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
              <div className="mt-8 flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting}
                >
                  Add Member
                </Button>
                <Button
                  colorSchema="secondary"
                  variant="plain"
                  onClick={() => handlePopUpClose("addMember")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col space-y-4">
              <div>All the users in your organization are already invited.</div>
              <Link href={`/org/${currentWorkspace?.orgId}/members`}>
                <Button variant="outline_bg">Add users to organization</Button>
              </Link>
            </div>
          )}
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the org?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};
