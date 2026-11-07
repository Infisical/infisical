import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import type { TProjectRole } from "@app/hooks/api/roles/types";
import { TemporaryPermissionMode } from "@app/hooks/api/shared/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { grantLabel, grantSlug } from "../roles";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED } from "../ui";
import { identitySubject, type ProjectIdentityMembership } from "./identity-common";
import { useProjectScope } from "./scope";
import {
  draftOf,
  DurationBadge,
  DurationPicker,
  type GrantDraft,
  permanent,
  toRolesDto
} from "./temporary-access";

import styles from "./identity.module.css";

type ProjectRoleOption = Pick<TProjectRole, "slug" | "name">;

const EDIT_ROLES_REASON = "You don't have permission to edit this identity's roles";

type Grant = ProjectIdentityMembership["roles"][number];

const useSetRoles = (projectId: string, identityId: string) => {
  const update = useV4Adapter("access").useUpdateProjectIdentityRoles();
  return (roles: readonly GrantDraft[]) =>
    update.mutateAsync({
      projectId,
      identityId,
      roles: toRolesDto(roles).map((role) =>
        role.isTemporary ? { ...role, temporaryMode: TemporaryPermissionMode.Relative } : role
      )
    });
};

const RoleAssignmentRow = ({
  draft,
  roles,
  showLabels,
  removable = false,
  onChange,
  onRemove
}: {
  draft: GrantDraft;
  roles: readonly ProjectRoleOption[];
  showLabels: boolean;
  removable?: boolean;
  onChange: (next: GrantDraft) => void;
  onRemove?: () => void;
}) => (
  <div className={styles.roleRow}>
    <div className={styles.roleField}>
      <Field label={showLabels ? "Role" : undefined}>
        <Select
          label="Role"
          value={draft.role}
          onChange={(role) => onChange({ ...draft, role })}
          options={roles.map((role) => ({ value: role.slug, label: role.name }))}
        />
      </Field>
    </div>
    <div className={styles.durationField}>
      <Field label={showLabels ? "Duration" : undefined}>
        <DurationPicker grant={draft} label="Duration" onChange={onChange} />
      </Field>
    </div>
    {removable && (
      <Button
        type="button"
        variant="danger-ghost"
        icon="trash"
        iconOnly
        disabled={!onRemove}
        onClick={onRemove}
      >
        Remove role
      </Button>
    )}
  </div>
);

const EditRolesSheet = ({
  projectId,
  membership,
  roles,
  canEdit,
  open,
  onOpenChange
}: {
  projectId: string;
  membership: ProjectIdentityMembership;
  roles: readonly ProjectRoleOption[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const setRoles = useSetRoles(projectId, membership.identity.id);
  const initial = membership.roles.map(draftOf);
  const [drafts, setDrafts] = useState(() =>
    membership.roles.map((grant) => ({ key: grant.id, grant: draftOf(grant) }))
  );
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(drafts.map((draft) => draft.grant)) !== JSON.stringify(initial);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>Roles</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id="project-identity-roles"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await setRoles(drafts.map((draft) => draft.grant));
                saved("Successfully updated roles");
                onOpenChange(false);
              } catch (error) {
                failed("Failed to update roles", error);
              } finally {
                setPending(false);
              }
            }}
          >
            <Stack gap={12}>
              {drafts.map((draft, index) => (
                <RoleAssignmentRow
                  key={draft.key}
                  draft={draft.grant}
                  roles={roles}
                  showLabels={index === 0}
                  removable
                  onChange={(grant) =>
                    setDrafts((current) =>
                      current.map((item) => (item.key === draft.key ? { ...item, grant } : item))
                    )
                  }
                  onRemove={
                    drafts.length > 1
                      ? () =>
                          setDrafts((current) => current.filter((item) => item.key !== draft.key))
                      : undefined
                  }
                />
              ))}
              <div>
                <Gate allowed={canEdit}>
                  <Button
                    type="button"
                    variant="outline"
                    icon="plus"
                    disabled={!canEdit || roles.length === 0}
                    onClick={() =>
                      setDrafts((current) => [
                        ...current,
                        { key: crypto.randomUUID(), grant: permanent(roles[0].slug) }
                      ])
                    }
                  >
                    Add role
                  </Button>
                </Gate>
              </div>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="project-identity-roles"
              loading={pending}
              disabled={!dirty || !canEdit || drafts.length === 0}
            >
              Save roles
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const EditRoleDialog = ({
  projectId,
  membership,
  roles,
  canEdit,
  grant,
  onOpenChange
}: {
  projectId: string;
  membership: ProjectIdentityMembership;
  roles: readonly ProjectRoleOption[];
  canEdit: boolean;
  grant?: Grant;
  onOpenChange: (open: boolean) => void;
}) => {
  const setRoles = useSetRoles(projectId, membership.identity.id);
  const [draft, setDraft] = useState(() => (grant ? draftOf(grant) : permanent("")));
  const [pending, setPending] = useState(false);
  const dirty = Boolean(grant) && JSON.stringify(draft) !== JSON.stringify(grant && draftOf(grant));
  return (
    <Dialog open={Boolean(grant)} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
        </DialogHeader>
        <RoleAssignmentRow draft={draft} roles={roles} showLabels onChange={setDraft} />
        <DialogFooter>
          <Button
            variant="primary"
            loading={pending}
            disabled={!dirty || !canEdit}
            onClick={async () => {
              setPending(true);
              try {
                await setRoles(
                  membership.roles.map((role) => (role.id === grant?.id ? draft : draftOf(role)))
                );
                saved("Successfully updated role");
                onOpenChange(false);
              } catch (error) {
                failed("Failed to update role", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const IdentityRoleDetailsSection = ({
  projectId,
  membership
}: {
  projectId: string;
  membership: ProjectIdentityMembership;
}) => {
  const scope = useProjectScope();
  const go = useGo();
  const { permission } = useProjectPermission(projectId);
  const { data: roles = [] } = useV4Adapter("access").useProjectRoles(projectId);
  const setRoles = useSetRoles(projectId, membership.identity.id);
  const [editing, setEditing] = useState<number>();
  const [modifying, setModifying] = useState<Grant>();
  const [removing, setRemoving] = useState<Grant>();
  const [removePending, setRemovePending] = useState(false);
  const canEdit = permission.can(
    ProjectPermissionIdentityActions.Edit,
    identitySubject(membership.identity.id)
  );
  const editButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEdit} reason={EDIT_ROLES_REASON}>
      <Button
        variant={variant}
        size="xs"
        icon="settings"
        disabled={!canEdit}
        onClick={() => setEditing(Date.now())}
      >
        Edit roles
      </Button>
    </Gate>
  );
  const columns: DataTableColumn<Grant>[] = [
    { id: "role", header: "Role", grow: true, render: (grant) => <span>{grantLabel(grant)}</span> },
    {
      id: "duration",
      header: "Duration",
      grow: true,
      render: (grant) => <DurationBadge grant={draftOf(grant)} />
    }
  ];

  const rowActions: DataTableRowActions<Grant> = {
    inline: [
      {
        label: "Modify role",
        icon: "settings",
        disabledReason: () => (canEdit ? undefined : RESTRICTED),
        onSelect: setModifying
      }
    ],
    renderMenu: (grant) => {
      let removeReason: string | undefined;
      if (!canEdit) removeReason = RESTRICTED;
      else if (membership.roles.length <= 1)
        removeReason = "A machine identity needs at least one role";
      return (
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(removeReason)}
          description={removeReason}
          onSelect={() => setRemoving(grant)}
        >
          <Icon name="trash" />
          Remove role
        </DropdownMenuItem>
      );
    }
  };

  const hasRoles = membership.roles.length > 0;
  return (
    <>
      <Card
        title="Project roles"
        flush={hasRoles}
        action={hasRoles ? editButton("outline") : undefined}
      >
        {hasRoles ? (
          <DataTable
            label="Project roles"
            rows={membership.roles}
            columns={columns}
            rowActions={rowActions}
            getRowId={(grant) => grant.id}
            rowLabel={grantLabel}
            onRowActivate={(grant) => go(accessLinks.projectRole(scope, grantSlug(grant)))}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="user"
            title="This machine identity doesn't have any roles"
            actions={editButton("primary")}
          />
        )}
      </Card>
      <EditRolesSheet
        key={editing}
        projectId={projectId}
        membership={membership}
        roles={roles}
        canEdit={canEdit}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <EditRoleDialog
        key={modifying?.id}
        projectId={projectId}
        membership={membership}
        roles={roles}
        canEdit={canEdit}
        grant={modifying}
        onOpenChange={(open) => !open && setModifying(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="remove" pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove role ${removing ? grantLabel(removing) : ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The machine identity will lose the permissions granted by this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                setRemovePending(true);
                try {
                  await setRoles(
                    membership.roles.filter((role) => role.id !== removing?.id).map(draftOf)
                  );
                  saved("Successfully removed role");
                  setRemoving(undefined);
                } catch (error) {
                  failed("Failed to remove role", error);
                } finally {
                  setRemovePending(false);
                }
              }}
            >
              Remove role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
