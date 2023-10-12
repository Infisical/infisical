import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import {
  faCheck,
  faCopy,
  faMagnifyingGlass,
  faPlus,
  faTrash,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  DeleteActionModal,
  EmailServiceSetupModal,
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
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser,
  useWorkspace
} from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useAddUserToOrg,
  useDeleteOrgMembership,
  useGetOrgUsers,
  useGetSSOConfig,
  useGetUserWorkspaceMemberships,
  useGetUserWsKey,
  useUpdateOrgUserRole,
  useUploadWsKey
} from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

type Props = {
  roles?: TRole<undefined>[];
  isRolesLoading?: boolean;
};

const addMemberFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim().lowercase()
});

type TAddMemberForm = yup.InferType<typeof addMemberFormSchema>;

export const OrgMembersTable = ({ roles = [], isRolesLoading }: Props) => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();

  const { currentOrg } = useOrganization();
  const { workspaces, currentWorkspace } = useWorkspace();
  const { user } = useUser();
  const userId = user?._id || "";
  const orgId = currentOrg?._id || "";
  const workspaceId = currentWorkspace?._id || "";

  const { data: ssoConfig, isLoading: isLoadingSSOConfig } = useGetSSOConfig(orgId);
  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const { data: serverDetails } = useFetchServerStatus();

  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan",
    "setUpEmail"
  ] as const);
  const { subscription } = useSubscription();

  const { data: members, isLoading: isMembersLoading } = useGetOrgUsers(orgId);
  const { data: workspaceMemberships, isLoading: IsWsMembershipLoading } =
    useGetUserWorkspaceMemberships(orgId);
  const { data: wsKey } = useGetUserWsKey(workspaceId);

  const removeUserOrgMembership = useDeleteOrgMembership();
  const addUserToOrg = useAddUserToOrg();
  const updateOrgUserRole = useUpdateOrgUserRole();
  const uploadWsKey = useUploadWsKey();

  const [completeInviteLink, setCompleteInviteLink] = useState<string | undefined>("");

  const isMoreUsersNotAllowed = subscription?.memberLimit
    ? subscription.membersUsed >= subscription.memberLimit
    : false;

  useEffect(() => {
    if (router.query.action === "invite") {
      handlePopUpOpen("addMember");
    }
  }, []);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: yupResolver(addMemberFormSchema) });

  const onAddMember = async ({ email }: TAddMemberForm) => {
    if (!currentOrg?._id) return;

    try {
      const { data } = await addUserToOrg.mutateAsync({
        organizationId: currentOrg?._id,
        inviteeEmail: email
      });
      setCompleteInviteLink(data?.completeInviteLink);
      // only show this notification when email is configured.
      // A [completeInviteLink] will not be sent if smtp is configured
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
    if (serverDetails?.emailConfigured) {
      handlePopUpClose("addMember");
    }
    reset();
  };

  const onAddUserToOrg = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      const { data } = await addUserToOrg.mutateAsync({
        organizationId: currentOrg?._id,
        inviteeEmail: email
      });
      setCompleteInviteLink(data?.completeInviteLink);

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

  const onRemoveOrgMemberApproved = async () => {
    const membershipId = (popUp?.removeMember?.data as { id: string })?.id;
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
    handlePopUpClose("removeMember");
  };

  const isIamOwner = useMemo(
    () => members?.find(({ user: u }) => userId === u?._id)?.role === "owner",
    [userId, members]
  );

  const isIamMember = useMemo(
    () => members?.find(({ user: u }) => userId === u?._id)?.role === "member",
    [userId, members]
  );

  const findRoleFromId = useCallback(
    (roleId: string) => {
      return roles.find(({ _id: id }) => id === roleId);
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

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInviteLinkCopied) {
      timer = setTimeout(() => setInviteLinkCopied.off(), 2000);
    }
    return () => clearTimeout(timer);
  }, [isInviteLinkCopied]);

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

      await uploadWsKey.mutateAsync({
        userId: grantedUserId,
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

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(completeInviteLink as string);
    setInviteLinkCopied.on();
  };

  const isLoading = isMembersLoading || IsWsMembershipLoading || isRolesLoading;

  return (
    <div className="w-full">
      <div className="mb-4 flex">
        <div className="mr-4 flex-1">
          <Input
            value={searchMemberFilter}
            onChange={(e) => setSearchMemberFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search members..."
          />
        </div>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                if (!isLoadingSSOConfig && ssoConfig && ssoConfig.isActive) {
                  createNotification({
                    text: "You cannot invite users when SAML SSO is configured for your organization",
                    type: "error"
                  });

                  return;
                }

                if (isMoreUsersNotAllowed) {
                  handlePopUpOpen("upgradePlan");
                } else {
                  handlePopUpOpen("addMember");
                }
              }}
            >
              Add Member
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <div>
        <TableContainer>
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
              {isLoading && <TableSkeleton columns={5} innerKey="org-members" />}
              {!isLoading &&
                filterdUser?.map(
                  ({ user: u, inviteEmail, role, customRole, _id: orgMembershipId, status }) => {
                    const name = u ? `${u.firstName} ${u.lastName}` : "-";
                    const email = u?.email || inviteEmail;
                    const userWs = workspaceMemberships?.[u?._id];

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
                                    defaultValue={
                                      role === "custom" ? findRoleFromId(customRole)?.slug : role
                                    }
                                    isDisabled={userId === u?._id || !isAllowed}
                                    className="w-40 bg-mineshaft-600"
                                    dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                    onValueChange={(selectedRole) =>
                                      onRoleChange(orgMembershipId, selectedRole)
                                    }
                                  >
                                    {roles
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
                                      onClick={() => onAddUserToOrg(email)}
                                    >
                                      Resend Invite
                                    </Button>
                                  )}
                                {status === "completed" && (
                                  <Button
                                    colorSchema="secondary"
                                    isDisabled={!isAllowed}
                                    onClick={() => onGrantAccess(u?._id, u?.publicKey)}
                                  >
                                    Grant Access
                                  </Button>
                                )}
                              </>
                            )}
                          </OrgPermissionCan>
                        </Td>
                        <Td>
                          {userWs ? (
                            userWs?.map(({ name: wsName, _id }) => (
                              <Tag key={`user-${u._id}-workspace-${_id}`} className="my-1">
                                {wsName}
                              </Tag>
                            ))
                          ) : (
                            <div className="flex flex-row">
                              {(status === "invited" || status === "verified") &&
                              serverDetails?.emailConfigured ? (
                                <Tag colorSchema="red">
                                  This user hasn&apos;t accepted the invite yet
                                </Tag>
                              ) : (
                                <Tag colorSchema="red">
                                  This user isn&apos;t part of any projects yet
                                </Tag>
                              )}
                              {router.query.id !== "undefined" &&
                                !(
                                  (status === "invited" || status === "verified") &&
                                  serverDetails?.emailConfigured
                                ) && !isIamMember && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      router.push(`/project/${workspaces[0]?._id}/members`)
                                    }
                                    className="w-max cursor-pointer rounded-sm bg-mineshaft px-1.5 py-0.5 text-sm duration-200 hover:bg-primary hover:text-black"
                                  >
                                    <FontAwesomeIcon icon={faPlus} className="mr-1" />
                                    Add to projects
                                  </button>
                                )}
                            </div>
                          )}
                        </Td>
                        <Td>
                          {userId !== u?._id && (
                            <OrgPermissionCan
                              I={OrgPermissionActions.Delete}
                              a={OrgPermissionSubjects.Member}
                            >
                              {(isAllowed) => (
                                <IconButton
                                  ariaLabel="delete"
                                  colorSchema="danger"
                                  isDisabled={userId === u?._id || !isAllowed}
                                  onClick={() =>
                                    handlePopUpOpen("removeMember", { id: orgMembershipId })
                                  }
                                >
                                  <FontAwesomeIcon icon={faTrash} />
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
      <Modal
        isOpen={popUp?.addMember?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addMember", isOpen);
          setCompleteInviteLink(undefined);
        }}
      >
        <ModalContent
          title={`Invite others to ${currentOrg?.name}`}
          subTitle={
            <div>
              {!completeInviteLink && (
                <div>
                  An invite is specific to an email address and expires after 1 day.
                  <br />
                  For security reasons, you will need to separately add members to projects.
                </div>
              )}
              {completeInviteLink &&
                "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"}
            </div>
          }
        >
          {!completeInviteLink && (
            <form onSubmit={handleSubmit(onAddMember)}>
              <Controller
                control={control}
                defaultValue=""
                name="email"
                render={({ field, fieldState: { error } }) => (
                  <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
                    <Input {...field} />
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
          )}
          {completeInviteLink && (
            <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{completeInviteLink}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={copyTokenToClipboard}
              >
                <FontAwesomeIcon icon={isInviteLinkCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  click to copy
                </span>
              </IconButton>
            </div>
          )}
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the org?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={onRemoveOrgMemberApproved}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add custom environments if you switch to Infisical's Team plan."
      />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
};
