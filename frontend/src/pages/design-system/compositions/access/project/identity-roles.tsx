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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { useAccess } from "../context";
import { type ProjectIdentity, type ProjectRoleGrant, roleName } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan } from "../ui";
import { DurationBadge, DurationPicker, type GrantDraft, permanent } from "./temporary-access";

import styles from "./identity.module.css";

const EDIT_ROLES_REASON = "You don't have permission to edit this identity's roles";

const draftOf = ({ id: _id, ...grant }: ProjectRoleGrant): GrantDraft => grant;

const RoleAssignmentRow = ({
  draft,
  showLabels,
  removable = false,
  onChange,
  onRemove
}: {
  draft: GrantDraft;
  showLabels: boolean;
  removable?: boolean;
  onChange: (next: GrantDraft) => void;
  onRemove?: () => void;
}) => {
  const { data } = useAccess();
  return (
    <div className={styles.roleRow}>
      <div className={styles.roleField}>
        <Field label={showLabels ? "Role" : undefined}>
          <Select
            label="Role"
            value={draft.role}
            onChange={(role) => onChange({ ...draft, role })}
            options={data.projectRoles.map((role) => ({ value: role.slug, label: role.name }))}
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
};

const useSetRoles = (identityId: string) => {
  const { update } = useAccess();
  return (roles: GrantDraft[]) =>
    update((current) => ({
      ...current,
      projectIdentities: current.projectIdentities.map((membership) =>
        membership.identityId === identityId
          ? { ...membership, roles: roles.map((role) => ({ ...role, id: crypto.randomUUID() })) }
          : membership
      )
    }));
};

const EditRolesSheet = ({
  membership,
  open,
  onOpenChange
}: {
  membership: ProjectIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, saved } = useAccess();
  const can = useCan("project");
  const setRoles = useSetRoles(membership.identityId);
  const initial = membership.roles.map(draftOf);
  const [drafts, setDrafts] = useState(() =>
    membership.roles.map((grant) => ({ key: grant.id, grant: draftOf(grant) }))
  );
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(drafts.map((draft) => draft.grant)) !== JSON.stringify(initial);
  const canEdit = can("identity", "edit");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Roles</SheetTitle>
          <SheetDescription>
            Select one or more of the pre-defined or custom roles to configure project permissions.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="project-identity-roles"
            onSubmit={(event) => {
              event.preventDefault();
              setPending(true);
              window.setTimeout(() => {
                setRoles(drafts.map((draft) => draft.grant));
                setPending(false);
                onOpenChange(false);
                saved("Successfully updated roles");
              }, 500);
            }}
          >
            <Stack gap={12}>
              {drafts.map((draft, index) => (
                <RoleAssignmentRow
                  key={draft.key}
                  draft={draft.grant}
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
                    variant="outline"
                    icon="plus"
                    disabled={!canEdit || data.projectRoles.length === 0}
                    onClick={() =>
                      setDrafts((current) => [
                        ...current,
                        { key: crypto.randomUUID(), grant: permanent(data.projectRoles[0].slug) }
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
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="project-identity-roles"
            loading={pending}
            disabled={!dirty || !canEdit}
          >
            Save roles
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const EditRoleDialog = ({
  membership,
  grant,
  onOpenChange
}: {
  membership: ProjectIdentity;
  grant?: ProjectRoleGrant;
  onOpenChange: (open: boolean) => void;
}) => {
  const { saved } = useAccess();
  const can = useCan("project");
  const setRoles = useSetRoles(membership.identityId);
  const [draft, setDraft] = useState(() => (grant ? draftOf(grant) : permanent("")));
  const [pending, setPending] = useState(false);
  const dirty = Boolean(grant) && JSON.stringify(draft) !== JSON.stringify(grant && draftOf(grant));
  return (
    <Dialog open={Boolean(grant)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>
            Update this role assignment and its access duration.
          </DialogDescription>
        </DialogHeader>
        <RoleAssignmentRow draft={draft} showLabels onChange={setDraft} />
        <DialogFooter>
          <Button
            variant="primary"
            loading={pending}
            disabled={!dirty || !can("identity", "edit")}
            onClick={() => {
              setPending(true);
              window.setTimeout(() => {
                setRoles(
                  membership.roles.map((role) => (role.id === grant?.id ? draft : draftOf(role)))
                );
                setPending(false);
                onOpenChange(false);
                saved("Successfully updated role");
              }, 500);
            }}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const IdentityRoleDetailsSection = ({ membership }: { membership: ProjectIdentity }) => {
  const { data, navigate, saved } = useAccess();
  const can = useCan("project");
  const setRoles = useSetRoles(membership.identityId);
  const [editing, setEditing] = useState<number>();
  const [modifying, setModifying] = useState<ProjectRoleGrant>();
  const [removing, setRemoving] = useState<ProjectRoleGrant>();
  const [menuFor, setMenuFor] = useState<string>();
  const canEdit = can("identity", "edit");
  const nameOf = (grant: ProjectRoleGrant) => roleName(data.projectRoles, grant.role);
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
  const columns: AccessColumn<ProjectRoleGrant>[] = [
    { id: "role", header: "Role", width: "50%", render: (grant) => <span>{nameOf(grant)}</span> },
    {
      id: "duration",
      header: "Duration",
      width: "50%",
      render: (grant) => <DurationBadge grant={grant} />
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (grant) => (
        <DropdownMenu
          open={menuFor === grant.id}
          onOpenChange={(open) => setMenuFor(open ? grant.id : undefined)}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Open actions for ${nameOf(grant)} role`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canEdit} onSelect={() => setModifying(grant)}>
              <Icon name="settings" />
              Modify role
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!canEdit}
              onSelect={() => setRemoving(grant)}
            >
              <Icon name="trash" />
              Remove role
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  const hasRoles = membership.roles.length > 0;
  return (
    <>
      <Card
        title="Project roles"
        description="Manage roles assigned to this machine identity"
        flush={hasRoles}
        action={hasRoles ? editButton("outline") : undefined}
      >
        {hasRoles ? (
          <AccessTable
            label="Project roles"
            rows={membership.roles}
            columns={columns}
            getRowId={(grant) => grant.id}
            rowLabel={nameOf}
            onRowClick={(grant) => {
              const role = data.projectRoles.find((item) => item.slug === grant.role);
              if (role)
                navigate({ detail: { kind: "project-role", id: role.id, label: role.name } });
            }}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="user"
            title="This machine identity doesn't have any roles"
            description="Give this machine identity one or more roles"
            actions={editButton("primary")}
          />
        )}
      </Card>
      <EditRolesSheet
        key={editing}
        membership={membership}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <EditRoleDialog
        key={modifying?.id}
        membership={membership}
        grant={modifying}
        onOpenChange={(open) => !open && setModifying(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="remove">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove role ${removing ? nameOf(removing) : ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The machine identity will lose the permissions granted by this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setRoles(membership.roles.filter((role) => role.id !== removing?.id).map(draftOf));
                setRemoving(undefined);
                saved("Successfully removed role");
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
