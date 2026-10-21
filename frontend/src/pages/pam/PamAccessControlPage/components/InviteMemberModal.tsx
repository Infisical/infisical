import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
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
import { useProject } from "@app/context";
import { useGetAvailableProjectUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { useAddPamProductUserMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TAvailableProjectUser } from "@app/hooks/api/users/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type SelectOption = {
  label: string;
  value: string;
};

const getUserLabel = ({ firstName, lastName, email, username }: TAvailableProjectUser) =>
  firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || email || username;

export const InviteMemberModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { mutate: addUser, isPending } = useAddPamProductUserMember();
  const navigate = useNavigate({ from: "" });

  const requesterEmail = useSearch({
    strict: false,
    select: (el) => (el as { requesterEmail?: string })?.requesterEmail
  });

  const [selectedUsers, setSelectedUsers] = useState<SelectOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(ProjectMembershipRole.Member);

  const { data: members } = useGetWorkspaceUsers(currentProject.id);
  const { data: candidates } = useGetAvailableProjectUsers(currentProject.id, currentProject.type);

  const wsUsernames = useMemo(() => new Set(members?.map((m) => m.user.username)), [members]);

  const availableUsers = useMemo(
    () => (candidates || []).map((user) => ({ value: user.id, label: getUserLabel(user) })),
    [candidates]
  );

  const requesterStatus = useMemo(() => {
    const requester = requesterEmail
      ? candidates?.find((user) => user.username === requesterEmail)
      : undefined;
    return {
      isProjectUser: Boolean(requesterEmail) && wsUsernames.has(requesterEmail as string),
      userLabel: requester ? getUserLabel(requester) : "",
      userId: requester?.id
    };
  }, [requesterEmail, candidates, wsUsernames]);

  useEffect(() => {
    if (requesterEmail && requesterStatus.userId && !requesterStatus.isProjectUser) {
      setSelectedUsers([{ value: requesterStatus.userId, label: requesterStatus.userLabel }]);
    }
  }, [
    requesterEmail,
    requesterStatus.userId,
    requesterStatus.isProjectUser,
    requesterStatus.userLabel
  ]);

  const clearRequesterEmail = () => {
    if (requesterEmail) {
      navigate({ search: (prev) => ({ ...prev, requesterEmail: "" }) });
    }
  };

  const handleClose = () => {
    setSelectedUsers([]);
    setSelectedRole(ProjectMembershipRole.Member);
    clearRequesterEmail();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!selectedUsers.length) return;

    addUser(
      {
        userIds: selectedUsers.map((selection) => selection.value),
        role: selectedRole,
        projectId: currentProject.id
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) clearRequesterEmail();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-xl">
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

          {requesterEmail && requesterStatus.isProjectUser && (
            <Alert variant="danger">
              <AlertDescription>
                Requested user is already a member of this product.
              </AlertDescription>
            </Alert>
          )}
          {requesterEmail && !requesterStatus.isProjectUser && requesterStatus.userId && (
            <Alert>
              <AlertDescription>
                <p>
                  Assign a role to provide access to requesting user{" "}
                  <b>{requesterStatus.userLabel}</b>.
                </p>
              </AlertDescription>
            </Alert>
          )}
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
