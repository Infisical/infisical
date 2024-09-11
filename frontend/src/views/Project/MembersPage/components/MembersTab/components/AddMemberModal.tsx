import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useAddUserToWsE2EE,
  useAddUserToWsNonE2EE,
  useGetOrgUsers,
  useGetUserWsKey,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addMemberFormSchema = z.object({
  orgMembershipId: z.string().trim()
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
};

export const AddMemberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const orgId = currentOrg?.id || "";
  const workspaceId = currentWorkspace?.id || "";

  const { data: wsKey } = useGetUserWsKey(workspaceId);
  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const { data: orgUsers } = useGetOrgUsers(orgId);

  const { mutateAsync: addUserToWorkspace } = useAddUserToWsE2EE();
  const { mutateAsync: addUserToWorkspaceNonE2EE } = useAddUserToWsNonE2EE();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: zodResolver(addMemberFormSchema) });

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
      } else {
        await addUserToWorkspaceNonE2EE({
          projectId: workspaceId,
          usernames: [orgUser.user.username],
          orgId
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
    handlePopUpToggle("addMember", false);
    reset();
  };

  const filteredOrgUsers = useMemo(() => {
    const wsUserUsernames = new Map();
    members?.forEach((member) => {
      wsUserUsernames.set(member.user.username, true);
    });
    return (orgUsers || []).filter(({ user: u }) => !wsUserUsernames.has(u.username));
  }, [orgUsers, members]);

  return (
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
                onClick={() => handlePopUpToggle("addMember", false)}
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
  );
};
