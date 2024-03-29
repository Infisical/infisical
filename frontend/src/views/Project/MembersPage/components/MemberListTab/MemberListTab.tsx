import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  faClock,
  faEdit,
  faMagnifyingGlass,
  faPlus,
  faUsers,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  FormControl,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
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
  Tooltip,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useUser,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useAddUserToWsE2EE,
  useAddUserToWsNonE2EE,
  useDeleteUserFromWorkspace,
  useGetOrgUsers,
  useGetUserWsKey,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { MemberRoleForm } from "./MemberRoleForm";

const addMemberFormSchema = z.object({
  orgMembershipId: z.string().trim()
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;
const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Member) return "Developer";
  return role;
};

export const MemberListTab = () => {
  const { t } = useTranslation();

  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();

  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";
  const workspaceId = currentWorkspace?.id || "";

  const { data: wsKey } = useGetUserWsKey(workspaceId);
  const { data: members, isLoading: isMembersLoading } = useGetWorkspaceUsers(workspaceId);
  const { data: orgUsers } = useGetOrgUsers(orgId);

  const [searchMemberFilter, setSearchMemberFilter] = useState("");

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "upgradePlan",
    "updateRole"
  ] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: zodResolver(addMemberFormSchema) });

  const { mutateAsync: addUserToWorkspace } = useAddUserToWsE2EE();
  const { mutateAsync: addUserToWorkspaceNonE2EE } = useAddUserToWsNonE2EE();
  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

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
      // TODO: update
      if (currentWorkspace.version === ProjectVersion.V1) {
        await addUserToWorkspace({
          workspaceId,
          userPrivateKey,
          decryptKey: wsKey,
          members: [{ orgMembershipId, userPublicKey: orgUser.user.publicKey }]
        });
      } else if (currentWorkspace.version === ProjectVersion.V2) {
        await addUserToWorkspaceNonE2EE({
          projectId: workspaceId,
          usernames: [orgUser.user.username]
        });
      } else {
        createNotification({
          text: "Failed to add user to project, unknown project type",
          type: "error"
        });

        return;
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
    const username = (popUp?.removeMember?.data as { username: string })?.username;
    if (!currentOrg?.id) return;

    try {
      await removeUserFromWorkspace({ workspaceId, usernames: [username] });
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

  const filterdUsers = useMemo(
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

  const filteredOrgUsers = useMemo(() => {
    const wsUserUsernames = new Map();
    members?.forEach((member) => {
      wsUserUsernames.set(member.user.username, true);
    });
    return (orgUsers || []).filter(
      ({ status, user: u }) => status === "accepted" && !wsUserUsernames.has(u.username)
    );
  }, [orgUsers, members]);

  return (
    <motion.div
      key="user-role-1"
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
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
                <Th>Username</Th>
                <Th>Role</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isMembersLoading && <TableSkeleton columns={4} innerKey="project-members" />}
              {!isMembersLoading &&
                filterdUsers?.map((projectMember, index) => {
                  const { user: u, inviteEmail, id: membershipId, roles } = projectMember;
                  const name = u ? `${u.firstName} ${u.lastName}` : "-";
                  const email = u?.email || inviteEmail;

                  return (
                    <Tr key={`membership-${membershipId}`} className="w-full">
                      <Td>{name}</Td>
                      <Td>{email}</Td>
                      <Td>
                        <div className="flex items-center space-x-2">
                          {roles
                            .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                            .map(
                              ({
                                role,
                                customRoleName,
                                id,
                                isTemporary,
                                temporaryAccessEndTime
                              }) => {
                                const isExpired =
                                  new Date() > new Date(temporaryAccessEndTime || ("" as string));
                                return (
                                  <Tag key={id}>
                                    <div className="flex items-center space-x-2">
                                      <div>{formatRoleName(role, customRoleName)}</div>
                                      {isTemporary && (
                                        <div>
                                          <Tooltip
                                            content={
                                              isExpired ? "Timed role expired" : "Timed role access"
                                            }
                                          >
                                            <FontAwesomeIcon
                                              icon={faClock}
                                              className={twMerge(isExpired && "text-red-600")}
                                            />
                                          </Tooltip>
                                        </div>
                                      )}
                                    </div>
                                  </Tag>
                                );
                              }
                            )}
                          {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                            <HoverCard>
                              <HoverCardTrigger>
                                <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
                              </HoverCardTrigger>
                              <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
                                {roles
                                  .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                  .map(
                                    ({
                                      role,
                                      customRoleName,
                                      id,
                                      isTemporary,
                                      temporaryAccessEndTime
                                    }) => {
                                      const isExpired =
                                        new Date() >
                                        new Date(temporaryAccessEndTime || ("" as string));
                                      return (
                                        <Tag key={id} className="capitalize">
                                          <div className="flex items-center space-x-2">
                                            <div>{formatRoleName(role, customRoleName)}</div>
                                            {isTemporary && (
                                              <div>
                                                <Tooltip
                                                  content={
                                                    isExpired
                                                      ? "Access expired"
                                                      : "Temporary access"
                                                  }
                                                >
                                                  <FontAwesomeIcon
                                                    icon={faClock}
                                                    className={twMerge(
                                                      new Date() >
                                                      new Date(
                                                        temporaryAccessEndTime as string
                                                      ) && "text-red-600"
                                                    )}
                                                  />
                                                </Tooltip>
                                              </div>
                                            )}
                                          </div>
                                        </Tag>
                                      );
                                    }
                                  )}
                              </HoverCardContent>
                            </HoverCard>
                          )}
                          {userId !== u?.id && (
                            <Tooltip content="Edit permission">
                              <IconButton
                                size="sm"
                                variant="plain"
                                ariaLabel="update-role"
                                onClick={() =>
                                  handlePopUpOpen("updateRole", { ...projectMember, index })
                                }
                              >
                                <FontAwesomeIcon icon={faEdit} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </div>
                      </Td>
                      <Td>
                        {userId !== u?.id && (
                          <div className="flex items-center space-x-2">
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
                                    handlePopUpOpen("removeMember", { username: u.username })
                                  }
                                >
                                  <FontAwesomeIcon icon={faXmark} />
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isMembersLoading && filterdUsers?.length === 0 && (
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
                defaultValue={filteredOrgUsers?.[0]?.user?.username}
                name="orgMembershipId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl label="Username" isError={Boolean(error)} errorText={error?.message}>
                    <Select
                      position="popper"
                      className="w-full"
                      defaultValue={filteredOrgUsers?.[0]?.user?.username}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      {filteredOrgUsers.map(({ id: orgUserId, user: u }) => (
                        <SelectItem value={orgUserId} key={`org-membership-join-${orgUserId}`}>
                          {u?.username}
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
      <Modal
        isOpen={popUp.updateRole.isOpen}
        onOpenChange={(state) => handlePopUpToggle("updateRole", state)}
      >
        <ModalContent
          className="max-w-4xl"
          title={`Manage Access for ${(popUp.updateRole.data as TWorkspaceUser)?.user?.email}`}
          subTitle={`
          Configure role-based access control by assigning Infisical users a mix of roles and specific privileges. A user will gain access to all actions within the roles assigned to them, not just the actions those roles share in common. You must choose at least one permanent role.
          `}
        >
          <MemberRoleForm
            onOpenUpgradeModal={(description) => handlePopUpOpen("upgradePlan", { description })}
            projectMember={
              filterdUsers?.[
              (popUp.updateRole?.data as TWorkspaceUser & { index: number })?.index
              ] as TWorkspaceUser
            }
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the project?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </motion.div>
  );
};
