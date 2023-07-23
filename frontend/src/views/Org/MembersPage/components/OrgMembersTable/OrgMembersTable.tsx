import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { faCheck, faCopy, faMagnifyingGlass, faPlus, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  DeleteActionModal,
  EmailServiceSetupModal,  EmptyState,
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
import { useOrganization , useWorkspace } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetSSOConfig } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { OrgUser, Workspace } from "@app/hooks/api/types";

type Props = {
  members?: OrgUser[];
  workspaceMemberships?: Record<string, Workspace[]>;
  orgName: string;
  isLoading?: boolean;
  isMoreUserNotAllowed: boolean;
  onRemoveMember: (userId: string) => Promise<void>;
  onInviteMember: (email: string) => Promise<void>;
  onRoleChange: (membershipId: string, role: string) => Promise<void>;
  onGrantAccess: (userId: string, publicKey: string) => Promise<void>;
  // the current user id to block remove org button
  userId: string;
  completeInviteLink: string | undefined,
  setCompleteInviteLink: Dispatch<SetStateAction<string | undefined>>
};

const addMemberFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim()
});

type TAddMemberForm = yup.InferType<typeof addMemberFormSchema>;

export const OrgMembersTable = ({
  members = [],
  workspaceMemberships = {},
  orgName,
  isMoreUserNotAllowed,
  onRemoveMember,
  onInviteMember,
  onGrantAccess,
  onRoleChange,
  userId,
  isLoading,
  completeInviteLink,
  setCompleteInviteLink
}: Props) => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const { data: ssoConfig, isLoading: isLoadingSSOConfig } = useGetSSOConfig(currentOrg?._id ?? "");
  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const {data: serverDetails } = useFetchServerStatus()
  const { workspaces } = useWorkspace();
  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan",
    "setUpEmail"
  ] as const);
  
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
    await onInviteMember(email);
      if (serverDetails?.emailConfigured){
        handlePopUpClose("addMember");
      }
      
      reset();
  };

  const onRemoveOrgMemberApproved = async () => {
    const orgMembershipId = (popUp?.removeMember?.data as { id: string })?.id;
    await onRemoveMember(orgMembershipId);
    handlePopUpClose("removeMember");
  };

  const isIamOwner = useMemo(
    () => members.find(({ user }) => userId === user?._id)?.role === "owner",
    [userId, members]
  );
  
  const filterdUser = useMemo(
    () =>
      members.filter(
        ({ user, inviteEmail }) =>
          user?.firstName?.toLowerCase().includes(searchMemberFilter) ||
          user?.lastName?.toLowerCase().includes(searchMemberFilter) ||
          user?.email?.toLowerCase().includes(searchMemberFilter) ||
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

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(completeInviteLink as string);
    setInviteLinkCopied.on();
  };

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
        <Button
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            if (!isLoadingSSOConfig && ssoConfig && ssoConfig.isActive) {
              createNotification({
                text: "You cannot invite users when SAML SSO is configured for your organization",
                type: "error"
              });
              
              return;
            }
            
            if (isMoreUserNotAllowed) {
              handlePopUpOpen("upgradePlan");
            } else {
              handlePopUpOpen("addMember");
            }
          }}
        >
          Add Member
        </Button>
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
              {isLoading && <TableSkeleton columns={5} key="org-members" />}
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
                            <Tag key={`user-${user._id}-workspace-${_id}`} className="my-1">
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
                              onClick={() => router.push(`/project/${workspaces[0]?._id}/members`)}
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
      </div>
      <Modal
        isOpen={popUp?.addMember?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addMember", isOpen);
          setCompleteInviteLink(undefined) 
        }}
      >
        <ModalContent
          title={`Invite others to ${orgName}`}
          subTitle={
            <div>
              {!completeInviteLink && <div>
                An invite is specific to an email address and expires after 1 day.
                <br />
                For security reasons, you will need to separately add members to projects.
              </div>}
              {completeInviteLink && "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"}
            </div>
          }
        >
          {!completeInviteLink && <form onSubmit={handleSubmit(onAddMember)} >
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
          </form>}
          {
            completeInviteLink && 
            <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all">{completeInviteLink}</p>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={copyTokenToClipboard}
            >
              <FontAwesomeIcon icon={isInviteLinkCopied ? faCheck : faCopy} />
              <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">click to copy</span>
            </IconButton>
          </div>
          }
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