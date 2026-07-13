import { useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useAddUserToWsNonE2EE, useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type SelectOption = {
  label: string;
  value: string;
};

export const InviteMemberModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { mutate: addUser, isPending } = useAddUserToWsNonE2EE();

  const [selectedUsers, setSelectedUsers] = useState<SelectOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(ProjectMembershipRole.Member);

  const { data: members } = useGetWorkspaceUsers(currentProject.id);
  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);

  const availableUsers = useMemo(() => {
    const wsUsernames = new Set(members?.map((m) => m.user.username));
    return (orgUsers || [])
      .filter(({ user: u }) => !wsUsernames.has(u.username))
      .map(({ id, inviteEmail, user: { firstName, lastName, email } }) => ({
        value: id,
        label:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || email || inviteEmail
      }));
  }, [orgUsers, members]);

  const handleClose = () => {
    setSelectedUsers([]);
    setSelectedRole(ProjectMembershipRole.Member);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!selectedUsers.length) return;

    const usernames = selectedUsers
      .map((selection) => {
        const orgUser = orgUsers?.find((ou) => ou.id === selection.value);
        return orgUser?.user.username || orgUser?.user.email;
      })
      .filter(Boolean) as string[];

    addUser(
      {
        usernames,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [selectedRole]
      },
      {
        onSuccess: () => {
          createNotification({
            text: `Successfully added ${selectedUsers.length === 1 ? "member" : "members"}`,
            type: "success"
          });
          handleClose();
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Add existing organization members.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Field>
            <FieldLabel>
              Users <span className="text-product-pam">*</span>
            </FieldLabel>
            <FilterableSelect
              placeholder="Select one or more users..."
              isMulti
              options={availableUsers}
              value={selectedUsers}
              onChange={(val) => setSelectedUsers(val as SelectOption[])}
              noOptionsMessage={() => "All organization members have already been added."}
            />
          </Field>

          <Field>
            <FieldLabel>
              Product role <span className="text-product-pam">*</span>
            </FieldLabel>
            <ProductRoleOptionList value={selectedRole} onChange={setSelectedRole} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="pam"
            isDisabled={!selectedUsers.length}
            isPending={isPending}
            onClick={handleSubmit}
          >
            Add {selectedUsers.length > 1 ? "Members" : "Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
