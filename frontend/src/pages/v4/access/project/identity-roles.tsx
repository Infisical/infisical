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
import { Icon } from "@app/components/v4/ui/icon";
import { RowLink } from "@app/components/v4/ui/row-link";
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
import { AddRoleSheet, RoleGrantRow } from "./role-grant";
import { useProjectScope } from "./scope";
import { draftOf, DurationBadge, type GrantDraft, permanent, toRolesDto } from "./temporary-access";

type ProjectRoleOption = Pick<TProjectRole, "slug" | "name">;

const EDIT_ROLES_REASON = "You don't have permission to edit this identity's roles";
const ALL_ASSIGNED = "This machine identity already has every project role";

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
        <RoleGrantRow grant={draft} options={roles} onChange={setDraft} />
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
  const go = useGo();
  const scope = useProjectScope();
  const { permission } = useProjectPermission(projectId);
  const { data: roles = [] } = useV4Adapter("access").useProjectRoles(projectId);
  const setRoles = useSetRoles(projectId, membership.identity.id);
  const [adding, setAdding] = useState<number>();
  const [modifying, setModifying] = useState<Grant>();
  const [removing, setRemoving] = useState<Grant>();
  const [removePending, setRemovePending] = useState(false);
  const canEdit = permission.can(
    ProjectPermissionIdentityActions.Edit,
    identitySubject(membership.identity.id)
  );
  const addable = roles.filter(
    (role) => !membership.roles.some((grant) => grantSlug(grant) === role.slug)
  );
  let addReason: string | undefined;
  if (!canEdit) addReason = EDIT_ROLES_REASON;
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
          {...go.link(accessLinks.projectRole(scope, grantSlug(grant)))}
          title={grantLabel(grant)}
        >
          {grantLabel(grant)}
        </RowLink>
      )
    },
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
      <Card variant="framed" title="Project roles" flush={hasRoles} action={addButton}>
        {hasRoles ? (
          <DataTable
            label="Project roles"
            rows={membership.roles}
            columns={columns}
            rowActions={rowActions}
            getRowId={(grant) => grant.id}
            rowLabel={grantLabel}
          />
        ) : (
          <EmptyState size="sm" icon="user" title="This machine identity doesn't have any roles" />
        )}
      </Card>
      <AddRoleSheet
        key={adding}
        open={adding !== undefined}
        options={addable}
        onOpenChange={(open) => !open && setAdding(undefined)}
        onAdd={async (grant) => {
          try {
            await setRoles([...membership.roles.map(draftOf), grant]);
            saved("Successfully added role");
            return true;
          } catch (error) {
            failed("Failed to add role", error);
            return false;
          }
        }}
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
