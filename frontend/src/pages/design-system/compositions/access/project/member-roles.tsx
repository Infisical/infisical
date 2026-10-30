import { useState } from "react";
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

import { useAccess } from "../context";
import { type ProjectMember, type ProjectRoleGrant, roleName } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan } from "../ui";
import { DurationBadge, DurationPicker, type GrantDraft, permanent } from "./temporary-access";

import styles from "./project.module.css";

const NO_EDIT = "You don't have permission to edit this user's roles";

const draftOf = ({ id: _id, ...grant }: ProjectRoleGrant): GrantDraft => grant;

const RoleGrantRow = ({
  grant,
  index,
  labels,
  disabled,
  durationOpen,
  action,
  onChange
}: {
  grant: GrantDraft;
  index: number;
  labels: boolean;
  disabled: boolean;
  durationOpen?: boolean;
  action?: React.ReactNode;
  onChange: (next: GrantDraft) => void;
}) => {
  const { data } = useAccess();
  return (
    <div className={styles.grantRow} data-labels={labels || undefined}>
      <div className={styles.grow}>
        <Field label={labels ? "Role" : undefined}>
          <Select
            label={`Role ${index + 1}`}
            value={grant.role}
            disabled={disabled}
            options={data.projectRoles.map((role) => ({ value: role.slug, label: role.name }))}
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
            defaultOpen={durationOpen}
            onChange={onChange}
          />
        </Field>
      </div>
      {action}
    </div>
  );
};

const toGrants = (memberId: string, drafts: GrantDraft[]): ProjectRoleGrant[] =>
  drafts.map((draft, index) => ({ id: `${memberId}-${index}-${draft.role}`, ...draft }));

export const EditRolesSheet = ({
  member,
  open,
  openDurationOf,
  onOpenChange,
  onSave
}: {
  member: ProjectMember;
  open: boolean;
  openDurationOf?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (roles: ProjectRoleGrant[]) => void;
}) => {
  const can = useCan("project");
  const disabled = !can("member", "edit");
  const initial = member.roles.map(draftOf);
  const [drafts, setDrafts] = useState(initial);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDrafts(member.roles.map(draftOf));
        onOpenChange(next);
      }}
    >
      <SheetContent className={styles.wideSheet}>
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
                durationOpen={member.roles[index]?.id === openDurationOf}
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
                  disabled={disabled}
                  onClick={() => setDrafts((current) => [...current, permanent("member")])}
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
              disabled={!dirty || disabled}
              onClick={() => onSave(toGrants(member.id, drafts))}
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
  onOpenChange,
  onSave
}: {
  grant: ProjectRoleGrant;
  onOpenChange: (open: boolean) => void;
  onSave: (next: GrantDraft) => void;
}) => {
  const can = useCan("project");
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
          disabled={!can("member", "edit")}
          onChange={setDraft}
        />
        <DialogFooter>
          <Button
            variant="primary"
            disabled={!dirty || !can("member", "edit")}
            onClick={() => onSave(draft)}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const MemberRolesSection = ({
  member,
  isSelf,
  initialSheet
}: {
  member: ProjectMember;
  isSelf: boolean;
  initialSheet?: boolean;
}) => {
  const { data, update, saved, navigate } = useAccess();
  const can = useCan("project");
  const catalog = data.projectRoles;
  const [sheetOpen, setSheetOpen] = useState(Boolean(initialSheet));
  const [editing, setEditing] = useState<ProjectRoleGrant>();
  const [removing, setRemoving] = useState<ProjectRoleGrant>();
  const canEdit = can("member", "edit");

  const setRoles = (roles: ProjectRoleGrant[]) =>
    update((current) => ({
      ...current,
      projectMembers: current.projectMembers.map((item) =>
        item.id === member.id ? { ...item, roles } : item
      )
    }));

  const editButton = (variant: "outline" | "primary", disabled: boolean) => (
    <Gate allowed={!disabled} reason={NO_EDIT}>
      <Button variant={variant} size="xs" disabled={disabled} onClick={() => setSheetOpen(true)}>
        <Icon icon={PencilIcon} size={12} />
        Edit roles
      </Button>
    </Gate>
  );

  const columns: AccessColumn<ProjectRoleGrant>[] = [
    {
      id: "role",
      header: "Role",
      width: "50%",
      render: (grant) => <span>{roleName(catalog, grant.role)}</span>
    },
    {
      id: "duration",
      header: "Duration",
      render: (grant) => <DurationBadge grant={grant} />
    },
    ...(isSelf
      ? []
      : [
          {
            id: "actions",
            header: "Actions",
            actions: true,
            render: (grant: ProjectRoleGrant) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                    {`Actions for role ${roleName(catalog, grant.role)}`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!canEdit} onSelect={() => setEditing(grant)}>
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
          } satisfies AccessColumn<ProjectRoleGrant>
        ])
  ];

  const removingCustom = catalog.find((role) => role.slug === removing?.role)?.builtIn === false;
  const removingLabel = removingCustom ? roleName(catalog, removing?.role ?? "") : removing?.role;

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
            <AccessTable
              label="Project roles"
              rows={member.roles}
              columns={columns}
              getRowId={(grant) => grant.id}
              rowLabel={(grant) => roleName(catalog, grant.role)}
              onRowClick={(grant) => {
                const role = catalog.find((item) => item.slug === grant.role);
                if (role)
                  navigate({ detail: { kind: "project-role", id: role.id, label: role.name } });
              }}
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
        member={member}
        open={sheetOpen}
        openDurationOf={
          initialSheet ? member.roles.find((grant) => grant.isTemporary)?.id : undefined
        }
        onOpenChange={setSheetOpen}
        onSave={(roles) => {
          setRoles(roles);
          setSheetOpen(false);
          saved("Successfully updated roles");
        }}
      />
      {editing && (
        <EditRoleDialog
          grant={editing}
          onOpenChange={(next) => !next && setEditing(undefined)}
          onSave={(next) => {
            setRoles(
              member.roles.map((grant) =>
                grant.id === editing.id ? { id: grant.id, ...next } : grant
              )
            );
            setEditing(undefined);
            saved("Successfully updated role");
          }}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="remove">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove role "${removingLabel}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This role will no longer grant access to this user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setRoles(member.roles.filter((grant) => grant.id !== removing?.id));
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
