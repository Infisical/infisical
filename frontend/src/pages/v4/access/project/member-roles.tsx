import { type ReactNode, useState } from "react";
import { PencilIcon } from "lucide-react";

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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
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
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { grantLabel, grantSlug } from "../roles";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED } from "../ui";
import { type ProjectRoleOption, useMemberRoleAccess } from "./member-access";
import { useProjectScope } from "./scope";
import {
  draftOf,
  DurationBadge,
  DurationPicker,
  type GrantDraft,
  permanent,
  toRolesDto
} from "./temporary-access";

import styles from "./project.module.css";

type Grant = TWorkspaceUser["roles"][number];

const NO_EDIT = "You don't have permission to edit this user's roles";

const RoleGrantRow = ({
  grant,
  index,
  labels,
  disabled,
  options,
  action,
  onChange
}: {
  grant: GrantDraft;
  index: number;
  labels: boolean;
  disabled: boolean;
  options: readonly ProjectRoleOption[];
  action?: ReactNode;
  onChange: (next: GrantDraft) => void;
}) => (
  <div className={styles.grantRow} data-labels={labels || undefined}>
    <div className={styles.grow}>
      <Field label={labels ? "Role" : undefined}>
        <Select
          label={`Role ${index + 1}`}
          value={grant.role}
          disabled={disabled}
          options={options.map((role) => ({ value: role.slug, label: role.name }))}
          onChange={(role) => onChange({ ...grant, role })}
        />
      </Field>
    </div>
    <div className={styles.durationCell}>
      <Field label={labels ? "Duration" : undefined}>
        <DurationPicker
          label={`Duration for role ${index + 1}`}
          grant={grant}
          disabled={disabled}
          onChange={onChange}
        />
      </Field>
    </div>
    {action}
  </div>
);

const EditRolesSheet = ({
  member,
  projectId,
  open,
  onOpenChange,
  onSave
}: {
  member: TWorkspaceUser;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (drafts: GrantDraft[]) => Promise<void>;
}) => {
  const { canEdit, assignable, optionsFor } = useMemberRoleAccess(projectId, member.user.email);
  const disabled = !canEdit;
  const [initial] = useState(() => member.roles.map(draftOf));
  const [drafts, setDrafts] = useState(initial);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial);
  const save = async () => {
    setPending(true);
    await onSave(drafts);
    setPending(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={styles.wideSheet} pending={pending}>
        <SheetHeader>
          <SheetTitle>Roles</SheetTitle>
          <SheetDescription>
            Select one or more of the pre-defined or custom roles to configure project permissions.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className={styles.grantList}>
            {drafts.map((grant, index) => (
              <RoleGrantRow
                // oxlint-disable-next-line no-array-index-key -- rows have no id until saved
                key={index}
                grant={grant}
                index={index}
                labels={index === 0}
                disabled={disabled}
                options={optionsFor(grant.role)}
                onChange={(next) =>
                  setDrafts((current) => current.map((item, i) => (i === index ? next : item)))
                }
                action={
                  <Button
                    variant="outline"
                    icon="trash"
                    iconOnly
                    disabled={disabled || drafts.length === 1}
                    onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove role
                  </Button>
                }
              />
            ))}
            <span>
              <Gate allowed={!disabled}>
                <Button
                  variant="outline"
                  icon="plus"
                  disabled={disabled || !assignable.length}
                  onClick={() =>
                    setDrafts((current) => [
                      ...current,
                      permanent(
                        assignable.find((role) => role.slug === "member")?.slug ??
                          assignable[0].slug
                      )
                    ])
                  }
                >
                  Add role
                </Button>
              </Gate>
            </span>
          </div>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || disabled || !drafts.length}
              loading={pending}
              onClick={save}
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
  grant,
  member,
  projectId,
  onOpenChange,
  onSave
}: {
  grant: Grant;
  member: TWorkspaceUser;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSave: (next: GrantDraft) => void;
}) => {
  const { canEdit, optionsFor } = useMemberRoleAccess(projectId, member.user.email);
  const [draft, setDraft] = useState(draftOf(grant));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(grant));
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>
            Update this role assignment and its access duration.
          </DialogDescription>
        </DialogHeader>
        <RoleGrantRow
          grant={draft}
          index={0}
          labels
          disabled={!canEdit}
          options={optionsFor(draft.role)}
          onChange={setDraft}
        />
        <DialogFooter>
          <Button variant="primary" disabled={!dirty || !canEdit} onClick={() => onSave(draft)}>
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const MemberRolesSection = ({
  member,
  projectId,
  isSelf
}: {
  member: TWorkspaceUser;
  projectId: string;
  isSelf: boolean;
}) => {
  const scope = useProjectScope();
  const go = useGo();
  const updateRoles = useV4Adapter("access").useUpdateProjectUserRoles();
  const { canEdit } = useMemberRoleAccess(projectId, member.user.email);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [editing, setEditing] = useState<Grant>();
  const [removing, setRemoving] = useState<Grant>();

  const setRoles = async (drafts: GrantDraft[], message: string) => {
    try {
      await updateRoles.mutateAsync({
        membershipId: member.id,
        projectId,
        projectType: scope.projectType,
        roles: toRolesDto(drafts)
      });
      saved(message);
      return true;
    } catch (error) {
      failed("Failed to update roles", error);
      return false;
    }
  };

  const openSheet = () => {
    setSheetKey((current) => current + 1);
    setSheetOpen(true);
  };

  const editButton = (variant: "outline" | "primary", disabled: boolean) => (
    <Gate allowed={!disabled} reason={NO_EDIT}>
      <Button variant={variant} size="xs" disabled={disabled} onClick={openSheet}>
        <Icon icon={PencilIcon} size={12} />
        Edit roles
      </Button>
    </Gate>
  );

  const columns: DataTableColumn<Grant>[] = [
    {
      id: "role",
      header: "Role",
      grow: true,
      render: (grant) => <span>{grantLabel(grant)}</span>
    },
    {
      id: "duration",
      header: "Duration",
      render: (grant) => <DurationBadge grant={draftOf(grant)} />
    }
  ];

  const rowActions: DataTableRowActions<Grant> = {
    inline: [
      {
        label: "Modify role",
        icon: "settings",
        disabledReason: () => (canEdit ? undefined : RESTRICTED),
        onSelect: setEditing
      }
    ],
    renderMenu: (grant) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={() => setRemoving(grant)}
      >
        <Icon name="trash" />
        Remove role
      </DropdownMenuItem>
    )
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Project roles</CardTitle>
          <CardDescription>Manage roles assigned to this user</CardDescription>
          {!isSelf && member.roles.length > 0 && (
            <CardAction>{editButton("outline", !canEdit)}</CardAction>
          )}
        </CardHeader>
        <CardContent>
          {member.roles.length ? (
            <DataTable
              label="Project roles"
              rows={member.roles}
              columns={columns}
              rowActions={isSelf ? undefined : rowActions}
              getRowId={(grant) => grant.id}
              rowLabel={(grant) => grantLabel(grant)}
              onRowActivate={(grant) => go(accessLinks.projectRole(scope, grantSlug(grant)))}
            />
          ) : (
            <EmptyState
              size="sm"
              title="This user doesn't have any roles"
              description="Give this user one or more roles"
              actions={editButton("primary", !canEdit || isSelf)}
            />
          )}
        </CardContent>
      </Card>
      <EditRolesSheet
        key={sheetKey}
        member={member}
        projectId={projectId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={async (drafts) => {
          if (await setRoles(drafts, "Successfully updated roles")) setSheetOpen(false);
        }}
      />
      {editing && (
        <EditRoleDialog
          grant={editing}
          member={member}
          projectId={projectId}
          onOpenChange={(next) => !next && setEditing(undefined)}
          onSave={async (next) => {
            const drafts = member.roles.map((grant) =>
              grant.id === editing.id ? next : draftOf(grant)
            );
            if (await setRoles(drafts, "Successfully updated role")) setEditing(undefined);
          }}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="remove">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove role "${removing ? grantLabel(removing) : ""}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This role will no longer grant access to this user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const id = removing?.id;
                setRemoving(undefined);
                setRoles(
                  member.roles.filter((grant) => grant.id !== id).map(draftOf),
                  "Successfully removed role"
                );
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
