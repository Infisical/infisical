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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Select } from "@infisical/cipher/ui/select";

import { SignerMemberRole, type TSignerMember } from "@app/hooks/api/signers/types";

import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import {
  type PickedSignerMembers,
  SignerAddMemberDialog
} from "../CodeSigningPage/add-member-dialog";
import {
  dateOnly,
  memberActorId,
  memberKind,
  memberLabel,
  SIGNER_MEMBER_KINDS,
  SIGNER_ROLE_OPTIONS
} from "../CodeSigningPage/signer-shared";

const kindLabel = (member: TSignerMember) =>
  SIGNER_MEMBER_KINDS.find((entry) => entry.value === memberKind(member))?.single ?? "Member";

export const MembersTab = ({
  orgId,
  projectId,
  signerId,
  canManageMembers
}: {
  orgId: string;
  projectId: string;
  signerId: string;
  canManageMembers: boolean;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const users = adapter.useSignerMembers({ signerId, kind: "user" });
  const identities = adapter.useSignerMembers({ signerId, kind: "identity" });
  const groups = adapter.useSignerMembers({ signerId, kind: "group" });
  const updateUserRole = adapter.useUpdateUserRole();
  const updateIdentityRole = adapter.useUpdateIdentityRole();
  const updateGroupRole = adapter.useUpdateGroupRole();
  const removeUser = adapter.useRemoveUserMember();
  const removeIdentity = adapter.useRemoveIdentityMember();
  const removeGroup = adapter.useRemoveGroupMember();
  const addUsers = adapter.useAddUserMembers();
  const addIdentity = adapter.useAddIdentityMember();
  const addGroup = adapter.useAddGroupMember();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TSignerMember>();
  const [removePending, setRemovePending] = useState(false);
  const [rolePending, setRolePending] = useState<string>();
  const rows = [
    ...(users.data?.memberships ?? []),
    ...(identities.data?.memberships ?? []),
    ...(groups.data?.memberships ?? [])
  ];
  const isPending = users.isPending || identities.isPending || groups.isPending;
  const error = users.error ?? identities.error ?? groups.error;
  const reason = canManageMembers ? undefined : RESTRICTED;

  const changeRole = async (member: TSignerMember, role: SignerMemberRole) => {
    const actorId = memberActorId(member);
    setRolePending(member.membershipId);
    try {
      if (member.actorUserId) await updateUserRole.mutateAsync({ signerId, userId: actorId, role });
      else if (member.actorIdentityId)
        await updateIdentityRole.mutateAsync({ signerId, identityId: actorId, role });
      else await updateGroupRole.mutateAsync({ signerId, groupId: actorId, role });
    } catch (roleError) {
      failed(`Couldn't change the role for ${memberLabel(member)}`, roleError);
    } finally {
      setRolePending(undefined);
    }
  };

  const add = async ({ kind, members, role }: PickedSignerMembers) => {
    if (kind === "user")
      await addUsers.mutateAsync({
        signerId,
        userIds: members.map((member) => member.id),
        emails: [],
        role
      });
    else {
      await Promise.all(
        members.map((member) =>
          kind === "identity"
            ? addIdentity.mutateAsync({ signerId, identityId: member.id, role })
            : addGroup.mutateAsync({ signerId, groupId: member.id, role })
        )
      );
      saved(members.length === 1 ? "Member added" : "Members added");
    }
  };

  const columns: DataTableColumn<TSignerMember>[] = [
    {
      id: "member",
      header: "Member",
      primary: true,
      grow: true,
      minWidth: 200,
      render: memberLabel,
      text: memberLabel,
      secondary: (member) => (member.actorUserId ? member.details?.email || undefined : undefined)
    },
    {
      id: "type",
      header: "Type",
      width: 160,
      render: (member) => <Badge tone="outline">{kindLabel(member)}</Badge>
    },
    {
      id: "role",
      header: "Role",
      width: 180,
      render: (member) => (
        <Select
          size="sm"
          aria-label={`Role for ${memberLabel(member)}`}
          options={SIGNER_ROLE_OPTIONS}
          value={member.role}
          disabled={!canManageMembers || rolePending === member.membershipId}
          onValueChange={(role) => changeRole(member, role as SignerMemberRole)}
        />
      )
    },
    {
      id: "added",
      header: "Added",
      width: 140,
      render: (member) => dateOnly(member.createdAt),
      text: (member) => dateOnly(member.createdAt)
    }
  ];

  return (
    <Card
      variant="framed"
      title="Members"
      flush
      action={
        <Button
          variant="outline"
          icon="user-plus"
          disabledReason={reason}
          onClick={() => setAdding(true)}
        >
          Add members
        </Button>
      }
    >
      <DataTable
        label="Signer members"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(member) => member.membershipId}
        rowLabel={memberLabel}
        empty={
          error ? (
            <EmptyState
              size="sm"
              icon="alert-c"
              title="Couldn't load members"
              description={error instanceof Error ? error.message : undefined}
            />
          ) : (
            <EmptyState
              size="sm"
              icon="users"
              title="No members yet"
              description="Add a user, machine identity or group to give them access to this signer."
            />
          )
        }
        rowActions={{
          renderMenu: (member) => (
            <DropdownMenuItem
              variant="destructive"
              disabled={!canManageMembers}
              description={reason}
              onSelect={() => setRemoving(member)}
            >
              <Icon name="trash" />
              Remove member
            </DropdownMenuItem>
          )
        }}
        persistentStatus={
          rows.length ? `${rows.length} ${rows.length === 1 ? "member" : "members"}` : undefined
        }
      />
      {adding && (
        <SignerAddMemberDialog
          orgId={orgId}
          projectId={projectId}
          taken={new Set(rows.map((member) => `${memberKind(member)}:${memberActorId(member)}`))}
          onSubmit={add}
          onClose={() => setAdding(false)}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && !removePending && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing ? memberLabel(removing) : "member"}?`}</AlertDialogTitle>
            <AlertDialogDescription>They lose all access to this signer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!removing) return;
                const actorId = memberActorId(removing);
                setRemovePending(true);
                try {
                  if (removing.actorUserId)
                    await removeUser.mutateAsync({ signerId, userId: actorId });
                  else if (removing.actorIdentityId)
                    await removeIdentity.mutateAsync({ signerId, identityId: actorId });
                  else await removeGroup.mutateAsync({ signerId, groupId: actorId });
                } catch (removeError) {
                  failed(`Couldn't remove ${memberLabel(removing)}`, removeError);
                  return;
                } finally {
                  setRemovePending(false);
                }
                setRemoving(undefined);
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
