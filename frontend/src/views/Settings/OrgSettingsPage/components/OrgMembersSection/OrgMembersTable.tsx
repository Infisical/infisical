import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { faMagnifyingGlass, faPlus, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Input,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization, useUser, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
    useAddUserToOrg,
    useDeleteOrgMembership,
    useGetOrgUsers,
    useGetUserWorkspaceMemberships,
    useGetUserWsKey,
    useUpdateOrgUserRole,
    useUploadWsKey
} from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

export const OrgMembersTable = () => {
  const router = useRouter();
  const { user: currentUser } = useUser();
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const { createNotification } = useNotificationContext();
  const [searchMemberFilter, setSearchMemberFilter] = useState("");

  const { data: serverDetails } = useFetchServerStatus()
  const { data: members, isLoading: isOrgUserLoading } = useGetOrgUsers(currentOrg?._id ?? ""); // members
  const { data: workspaceMemberships, isLoading: IsWsMembershipLoading } = useGetUserWorkspaceMemberships(currentOrg?._id ?? "");
  const { data: wsKey } = useGetUserWsKey(currentWorkspace?._id || "");

  const uploadWsKey = useUploadWsKey();
  const addUserToOrg = useAddUserToOrg();
  const removeUserOrgMembership = useDeleteOrgMembership();
  const updateOrgUserRole = useUpdateOrgUserRole();
    
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeMember",
    "setUpEmail"
  ] as const);

    const isLoading = isOrgUserLoading || IsWsMembershipLoading;
    const userId = currentUser?._id || "";
  const onRemoveMember = async (membershipId: string) => {
    if (!currentOrg?._id) return;

    try {
        if (!currentOrg?._id) return;
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

  const onRemoveOrgMemberApproved = async () => {
    const orgMembershipId = (popUp?.removeMember?.data as { id: string })?.id;
    await onRemoveMember(orgMembershipId);
    handlePopUpClose("removeMember");
  };


  const onInviteMember = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      const { data } = await addUserToOrg.mutateAsync({
        organizationId: currentOrg?._id,
        inviteeEmail: email
      });

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

  const onGrantAccess = async (targetUserId: string, publicKey: string) => {
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
        userId: targetUserId,
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

  const onRoleChange = async (membershipId: string, role: string) => {
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

  const isIamOwner = useMemo(
    () => members ? members.find(({ user }) => userId === user?._id)?.role === "owner" : [],
    [userId, members]
  );
  
  const filterdUser = useMemo(
    () =>
      members ? members.filter(
        ({ user, inviteEmail }) =>
          user?.firstName?.toLowerCase().includes(searchMemberFilter) ||
          user?.lastName?.toLowerCase().includes(searchMemberFilter) ||
          user?.email?.toLowerCase().includes(searchMemberFilter) ||
          inviteEmail?.includes(searchMemberFilter)
      ) : [],
    [members, searchMemberFilter]
  );


  return (
    <div className="w-full">
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
                <Th>Projects</Th>
                <Th aria-label="actions" />
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={5} />}
              {!isLoading &&
                filterdUser.map(({ user, inviteEmail, role, _id: orgMembershipId, status }) => {
                  const name = user ? `${user.firstName} ${user.lastName}` : "-";
                  const email = user?.email || inviteEmail;
                  const userWs = workspaceMemberships?.[user?._id];

                  return (
                    <Tr key={`org-membership-${orgMembershipId}`} className="w-full">
                      <Td>{name}</Td>
                      <Td>{email}</Td>
                      <Td>
                        {status === "accepted" && (
                          <Select
                            defaultValue={role}
                            isDisabled={userId === user?._id}
                            className="w-40 bg-mineshaft-600"
                            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                            onValueChange={(selectedRole) =>
                              onRoleChange(orgMembershipId, selectedRole)
                            }
                          >
                            {(isIamOwner || role === "owner") && (
                              <SelectItem value="owner">owner</SelectItem>
                            )}
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="member">member</SelectItem>
                          </Select>
                        )}
                        {((status === "invited" || status === "verified") && serverDetails?.emailConfigured) && (
                          <Button className='w-40' colorSchema="primary" variant="outline_bg" onClick={() => onInviteMember(email)}>
                            Resend Invite
                          </Button>
                        )}
                        {status === "completed" && (
                          <Button
                            colorSchema="secondary"
                            onClick={() => onGrantAccess(user?._id, user?.publicKey)}
                          >
                            Grant Access
                          </Button>
                        )}
                      </Td>
                      <Td>
                        {userWs ? (
                          userWs?.map(({ name: wsName, _id }) => (
                            <Tag key={`user-${currentUser._id}-workspace-${_id}`} className="my-1">
                              {wsName}
                            </Tag>
                          ))
                        ) : (
                          <div className='flex flex-row'>
                            {((status === "invited" || status === "verified") && serverDetails?.emailConfigured) 
                            ? <Tag colorSchema="red">This user hasn&apos;t accepted the invite yet</Tag>
                            : <Tag colorSchema="red">This user isn&apos;t part of any projects yet</Tag>}
                            {router.query.id !== "undefined" && !((status === "invited" || status === "verified") && serverDetails?.emailConfigured) && <button 
                              type="button"
                              onClick={() => router.push(`/users/${router.query.id}`)}
                              className='text-sm bg-mineshaft w-max px-1.5 py-0.5 hover:bg-primary duration-200 hover:text-black cursor-pointer rounded-sm'
                            >
                              <FontAwesomeIcon icon={faPlus} className="mr-1" />
                              Add to projects
                            </button>}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {userId !== user?._id && (
                          <IconButton
                            ariaLabel="delete"
                            colorSchema="danger"
                            isDisabled={userId === user?._id}
                            onClick={() => handlePopUpOpen("removeMember", { id: orgMembershipId })}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isLoading && filterdUser?.length === 0 && (
            <EmptyState title="No project members found" icon={faUsers} />
          )}
        </TableContainer>
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the org?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={onRemoveOrgMemberApproved}
      />
    </div>
  );
};