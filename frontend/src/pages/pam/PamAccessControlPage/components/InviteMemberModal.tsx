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

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type SelectOption = {
  label: string;
  value: string;
};

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access to all sections including settings, templates, and access control."
  },
  {
    value: "member",
    label: "Member",
    description: "Can only view Access page."
  }
];

export const InviteMemberModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { mutateAsync: addUser, isPending } = useAddUserToWsNonE2EE();

  const [selectedUsers, setSelectedUsers] = useState<SelectOption[]>([]);
  const [selectedRole, setSelectedRole] = useState("member");

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
    setSelectedRole("member");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!selectedUsers.length) return;

    const usernames = selectedUsers
      .map((selection) => {
        const orgUser = orgUsers?.find((ou) => ou.id === selection.value);
        return orgUser?.user.username || orgUser?.user.email;
      })
      .filter(Boolean) as string[];

    try {
      await addUser({
        usernames,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [selectedRole]
      });
      createNotification({
        text: `Successfully added ${selectedUsers.length === 1 ? "member" : "members"}`,
        type: "success"
      });
      handleClose();
    } catch {
      createNotification({ text: "Failed to add member", type: "error" });
    }
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
            <div className="flex flex-col gap-2">
              {ROLE_OPTIONS.map((option) => {
                const isSelected = selectedRole === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedRole(option.value)}
                    className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-product-pam/40 bg-product-pam/5"
                        : "border-border bg-container hover:bg-container-hover"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? "border-product-pam bg-product-pam" : "border-muted"
                      }`}
                    >
                      {isSelected && <div className="size-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
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
