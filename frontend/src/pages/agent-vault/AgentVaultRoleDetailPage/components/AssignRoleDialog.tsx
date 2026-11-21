import { useMemo, useState } from "react";

import { useAgentVaultAdminGuard } from "@app/components/agent-vault/useAgentVaultAdminGuard";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import { useProject, useUser } from "@app/context";
import { useDebounce, useDiscardChangesGuard } from "@app/hooks";
import {
  useAddAgentVaultMembers,
  useListAvailableAgentVaultMembers,
  useUpdateAgentVaultMemberRoles
} from "@app/hooks/api/agentVault";
import { TAgentVaultProductMember } from "@app/hooks/api/agentVault/types";

import {
  ASSIGN_GROUP_LABEL,
  buildAgentVaultAssignOptions,
  planAgentVaultRoleAssignment,
  TAssignOption
} from "./assignRoleOptions";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  roleSlug: string;
  roleName: string;
  members: TAgentVaultProductMember[];
};

const AssignOption = ({ option }: { option: TAssignOption }) => {
  const detail =
    option.disabledReason ??
    [option.email, option.currentRoles === null ? "Not in this project yet" : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="min-w-0">
      <p className="truncate">{option.name}</p>
      {detail && <p className="truncate text-xs leading-4 text-muted">{detail}</p>}
    </div>
  );
};

export const AssignRoleDialog = ({ isOpen, onOpenChange, roleSlug, roleName, members }: Props) => {
  const { projectId } = useProject();
  const { user } = useUser();
  const { isViewerAdmin } = useAgentVaultAdminGuard();
  const addMembers = useAddAgentVaultMembers(projectId);
  const updateRoles = useUpdateAgentVaultMemberRoles(projectId);

  const [selected, setSelected] = useState<TAssignOption[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: available, isFetching } = useListAvailableAgentVaultMembers(
    projectId,
    { search: debouncedSearch.trim() || undefined },
    isOpen
  );

  const options = useMemo(
    () =>
      buildAgentVaultAssignOptions({
        roleSlug,
        members,
        available: available?.actors ?? [],
        isViewerAdmin,
        viewerUserId: user?.id,
        search
      }),
    [roleSlug, members, available, isViewerAdmin, user?.id, search]
  );
  const isListTruncated = (available?.totalCount ?? 0) > (available?.actors.length ?? 0);

  const handleClose = () => {
    setSelected([]);
    setSearch("");
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty: selected.length > 0, onDiscard: handleClose });

  const handleAssign = async () => {
    const { adds, updates } = planAgentVaultRoleAssignment(roleSlug, selected);
    const calls = [
      ...adds.map((add) => () => addMembers.mutateAsync(add)),
      ...updates.map((update) => () => updateRoles.mutateAsync(update))
    ];
    setIsSubmitting(true);
    try {
      // One at a time: each call takes the project's member lock, so running them together gains nothing.
      const count = await calls.reduce(
        async (total, call) => (await total) + (await call()).members.length,
        Promise.resolve(0)
      );
      createNotification({
        text: count
          ? `"${roleName}" assigned to ${count} ${count === 1 ? "member" : "members"}`
          : `Everyone you picked already holds "${roleName}"`,
        type: count ? "success" : "info"
      });
      handleClose();
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            requestDiscard();
            return;
          }
          onOpenChange(open);
        }}
      >
        <DialogContent isPending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>Assign {roleName}</DialogTitle>
            <DialogDescription>
              Members keep their other roles, and anyone not in this project yet joins with only
              this role.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="agent-vault-assign-role">Assign To</FieldLabel>
            <FieldContent>
              <Combobox
                id="agent-vault-assign-role"
                multiple
                modal
                includeMissingSelectedOptions
                options={options}
                value={selected}
                isLoading={isFetching}
                onSearchChange={setSearch}
                onValueChange={setSelected}
                getOptionValue={(option) => option.key}
                getOptionLabel={(option) => option.name}
                getOptionGroup={(option) => ASSIGN_GROUP_LABEL[option.type]}
                isOptionDisabled={(option) => Boolean(option.disabledReason)}
                renderOption={(option) => <AssignOption option={option} />}
                placeholder="Pick users, machine identities or groups"
                searchAriaLabel="Search users, machine identities and groups"
                emptyMessage={(inputValue) =>
                  inputValue.trim()
                    ? "Nothing matches your search"
                    : "Everyone in your organization already holds this role"
                }
              />
              {isListTruncated && (
                <FieldDescription>
                  Search to find users, machine identities and groups that aren&apos;t listed.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>

          <DialogFooter>
            <Button variant="ghost" isDisabled={isSubmitting} onClick={requestDiscard}>
              Cancel
            </Button>
            <Button
              variant="av"
              isPending={isSubmitting}
              isDisabled={!selected.length}
              onClick={handleAssign}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Nobody you picked gets this role."
      />
    </>
  );
};
