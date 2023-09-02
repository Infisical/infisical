/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { useOrganization, useSubscription, useUser, useWorkspace } from "@app/context";
import {
  useAddIncidentContact,
  useAddUserToOrg,
  useDeleteIncidentContact,
  useDeleteOrgMembership,
  useGetOrgIncidentContact,
  useGetOrgUsers,
  useGetUserWorkspaceMemberships,
  useGetUserWsKey,
  useRenameOrg,
  useUpdateOrgUserRole,
  useUploadWsKey
} from "@app/hooks/api";

import {
  OrgIncidentContactsTable,
  OrgMembersTable,
  OrgNameChangeSection,
  OrgServiceAccountsTable
} from "./components";

export const MembersPage = () => {
  const host = window.location.origin;
  const router = useRouter();
  const { action } = router.query;

  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { createNotification } = useNotificationContext();

  const orgId = currentOrg?._id || "";

  const { data: orgUsers, isLoading: isOrgUserLoading } = useGetOrgUsers(orgId);
  const { data: workspaceMemberships, isLoading: IsWsMembershipLoading } =
    useGetUserWorkspaceMemberships(orgId);
  const { data: wsKey } = useGetUserWsKey(currentWorkspace?._id || "");
  const { data: incidentContact, isLoading: IsIncidentContactLoading } =
    useGetOrgIncidentContact(orgId);

  const renameOrg = useRenameOrg();
  const removeUserOrgMembership = useDeleteOrgMembership();
  const addUserToOrg = useAddUserToOrg();
  const updateOrgUserRole = useUpdateOrgUserRole();
  const uploadWsKey = useUploadWsKey();
  const addIncidentContact = useAddIncidentContact();
  const removeIncidentContact = useDeleteIncidentContact();

  const [completeInviteLink, setcompleteInviteLink] = useState<string | undefined>("");

  const isMoreUsersNotAllowed = subscription?.memberLimit
    ? subscription.membersUsed >= subscription.memberLimit
    : false;

  const onRenameOrg = async (name: string) => {
    if (!currentOrg?._id) return;

    try {
      await renameOrg.mutateAsync({ orgId: currentOrg?._id, newOrgName: name });
      createNotification({
        text: "Successfully renamed organization",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to rename organization",
        type: "error"
      });
    }
  };

  const onRemoveUserOrgMembership = async (membershipId: string) => {
    if (!currentOrg?._id) return;

    try {
      await removeUserOrgMembership.mutateAsync({ orgId: currentOrg?._id, membershipId });
      createNotification({
        text: "Successfully removed user from org",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove user from the organization",
        type: "error"
      });
    }
  };
  const onAddUserToOrg = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      const { data } = await addUserToOrg.mutateAsync({
        organizationId: currentOrg?._id,
        inviteeEmail: email
      });
      setcompleteInviteLink(data?.completeInviteLink);

      // only show this notification when email is configured. A [completeInviteLink] will not be sent if smtp is configured
      if (!data.completeInviteLink) {
        createNotification({
          text: "Successfully invited user to the organization.",
          type: "success"
        });
      }
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to invite user to org",
        type: "error"
      });
    }
  };

  const onUpdateOrgUserRole = async (membershipId: string, role: string) => {
    if (!currentOrg?._id) return;

    try {
      await updateOrgUserRole.mutateAsync({ organizationId: currentOrg?._id, membershipId, role });
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

  const onGrantUserAccess = async (userId: string, publicKey: string) => {
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

      await uploadWsKey.mutateAsync({
        userId,
        nonce,
        encryptedKey: ciphertext,
        workspaceId: currentWorkspace?._id || ""
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to grant access to user",
        type: "error"
      });
    }
  };

  const onAddIncidentContact = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      await addIncidentContact.mutateAsync({ orgId, email });
      createNotification({
        text: "Successfully added incident contact",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to add incident contact",
        type: "error"
      });
    }
  };

  const onRemoveIncidentContact = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      await removeIncidentContact.mutateAsync({ orgId, email });
      createNotification({
        text: "Successfully removed incident contact",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove incident contact",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mb-6 w-full py-6 px-6 max-w-7xl mx-auto">
        <p className="mr-4 mb-4 text-3xl font-semibold text-white">
          {t("section.members.org-members")}
        </p>
        <OrgMembersTable
          isLoading={isOrgUserLoading || IsWsMembershipLoading}
          isMoreUserNotAllowed={isMoreUsersNotAllowed}
          orgName={currentOrg?.name || ""}
          members={orgUsers}
          workspaceMemberships={workspaceMemberships}
          onInviteMember={onAddUserToOrg}
          userId={user?._id || ""}
          onRemoveMember={onRemoveUserOrgMembership}
          onRoleChange={onUpdateOrgUserRole}
          onGrantAccess={onGrantUserAccess}
          completeInviteLink={completeInviteLink}
          setCompleteInviteLink={setcompleteInviteLink}
        />
      </div>
    </div>
  );
};
