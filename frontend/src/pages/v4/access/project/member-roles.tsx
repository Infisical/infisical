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
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { RowLink } from "@infisical/cipher/ui/row-link";

import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { grantLabel, grantSlug } from "../roles";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED } from "../ui";
import { useMemberRoleAccess } from "./member-access";
import { accessLabel, linksMemberRoles, memberDetailId } from "./product";
import { AddRoleSheet, RoleGrantRow } from "./role-grant";
import { useProjectScope } from "./scope";
import { draftOf, DurationBadge, type GrantDraft, toRolesDto } from "./temporary-access";

type Grant = TWorkspaceUser["roles"][number];

const NO_EDIT = "You don't have permission to edit this user's roles";
const ALL_ASSIGNED = "This user already has every role you can assign";

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
        </DialogHeader>
        <RoleGrantRow
          grant={draft}
          options={optionsFor(draft.role)}
          disabledReason={canEdit ? undefined : NO_EDIT}
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
  const go = useGo();
  const scope = useProjectScope();
  const updateRoles = useV4Adapter("access").useUpdateProjectUserRoles();
  const { canEdit, assignable } = useMemberRoleAccess(projectId, member.user.email);
  const [adding, setAdding] = useState<number>();
  const [editing, setEditing] = useState<Grant>();
  const [removing, setRemoving] = useState<Grant>();
  const addable = assignable.filter(
    (role) => !member.roles.some((grant) => grantSlug(grant) === role.slug)
  );

  const setRoles = async (drafts: GrantDraft[], message: string) => {
    try {
      await updateRoles.mutateAsync({
        membershipId: memberDetailId(scope.projectType, member),
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

  let addReason: string | undefined;
  if (isSelf || !canEdit) addReason = NO_EDIT;
  else if (!addable.length) addReason = ALL_ASSIGNED;
  const addButton = (
    <Gate allowed={!addReason} reason={addReason}>
      <Button
        variant="accent"
        size="xs"
        icon="plus"
        disabled={Boolean(addReason)}
        onClick={() => setAdding(Date.now())}
      >
        Add role
      </Button>
    </Gate>
  );

  const columns: DataTableColumn<Grant>[] = [
    {
      id: "role",
      header: "Role",
      grow: true,
      render: (grant) => (
        <RowLink
          link={go.link(
            linksMemberRoles(scope.projectType)
              ? accessLinks.projectRole(scope, grantSlug(grant))
              : undefined
          )}
          title={grantLabel(grant)}
        >
          {grantLabel(grant)}
        </RowLink>
      )
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

  const hasRoles = member.roles.length > 0;
  return (
    <>
      <Card
        variant="framed"
        title={`${accessLabel(scope.projectType, "roles")}`}
        flush={hasRoles}
        action={isSelf ? undefined : addButton}
      >
        {hasRoles ? (
          <DataTable
            label={`${accessLabel(scope.projectType, "roles")}`}
            rows={member.roles}
            columns={columns}
            rowActions={isSelf ? undefined : rowActions}
            getRowId={(grant) => grant.id}
            rowLabel={(grant) => grantLabel(grant)}
          />
        ) : (
          <EmptyState size="sm" title="This user doesn't have any roles" />
        )}
      </Card>
      <AddRoleSheet
        key={adding}
        open={adding !== undefined}
        options={addable}
        onOpenChange={(open) => !open && setAdding(undefined)}
        onAdd={(grant) =>
          setRoles([...member.roles.map(draftOf), grant], "Successfully added role")
        }
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
