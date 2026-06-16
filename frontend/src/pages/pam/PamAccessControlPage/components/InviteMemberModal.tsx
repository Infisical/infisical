import { useMemo, useState } from "react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CreatableSelect,
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
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useProject
} from "@app/context";
import { useAddUserToWsNonE2EE, useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type SelectOption = {
  label: string;
  value: string;
  isNewInvitee?: boolean;
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
  const { permission: orgPermission } = useOrgPermission();
  const { mutateAsync: addUser, isPending } = useAddUserToWsNonE2EE();

  const [selectedUsers, setSelectedUsers] = useState<SelectOption[]>([]);
  const [selectedRole, setSelectedRole] = useState("member");

  const { data: members } = useGetWorkspaceUsers(currentProject.id);
  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);

  const canInviteNewMembers = orgPermission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );

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

    const existingMembers = selectedUsers.filter((u) => !u.isNewInvitee);
    const newInvitees = selectedUsers.filter((u) => u.isNewInvitee).map((u) => u.value);

    const existingUsernames = existingMembers
      .map((selection) => {
        const orgUser = orgUsers?.find((ou) => ou.id === selection.value);
        return orgUser?.user.username || orgUser?.user.email;
      })
      .filter(Boolean) as string[];

    try {
      await addUser({
        usernames: [...existingUsernames, ...newInvitees],
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
          <DialogDescription>
            Users will receive an email with instructions to gain access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Field>
            <FieldLabel>
              Users <span className="text-product-pam">*</span>
            </FieldLabel>
            {canInviteNewMembers ? (
              <CreatableSelect
                /* eslint-disable-next-line react/no-unstable-nested-components */
                noOptionsMessage={() => (
                  <>
                    {availableUsers.length === 0 && (
                      <p>All organization members are already assigned to this project.</p>
                    )}
                    <p>Invite new users to your organization by typing out their email address.</p>
                  </>
                )}
                onCreateOption={(inputValue) =>
                  setSelectedUsers((prev) => [
                    ...prev,
                    { label: inputValue, value: inputValue, isNewInvitee: true }
                  ])
                }
                formatCreateLabel={(inputValue) => `Invite "${inputValue}"`}
                isValidNewOption={(input) =>
                  Boolean(input) &&
                  z.string().email().safeParse(input).success &&
                  !orgUsers
                    ?.flatMap(({ user }) => [user.email, user.username].filter(Boolean))
                    .includes(input)
                }
                placeholder="Add one or more users..."
                isMulti
                options={availableUsers}
                value={selectedUsers}
                onChange={(val) => setSelectedUsers(val as SelectOption[])}
              />
            ) : (
              <FilterableSelect
                placeholder="Add one or more users..."
                isMulti
                options={availableUsers}
                value={selectedUsers}
                onChange={(val) => setSelectedUsers(val as SelectOption[])}
              />
            )}
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
