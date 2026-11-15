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
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication,
  type TPkiApplicationMember,
  type TPkiApplicationMemberKind
} from "@app/hooks/api/pkiApplications/types";

import { formatDate } from "../../access/roles";
import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { AddMemberDialog } from "./add-member-dialog";
import { APP_ROLES, appCan, plural } from "./shared";

const kindLabel: Record<TPkiApplicationMemberKind, string> = {
  user: "User",
  identity: "Machine identity",
  group: "Group"
};

const memberRef = (
  member: TPkiApplicationMember
): { kind: TPkiApplicationMemberKind; memberId: string } => {
  if (member.actorUserId) return { kind: "user", memberId: member.actorUserId };
  if (member.actorIdentityId) return { kind: "identity", memberId: member.actorIdentityId };
  if (member.actorGroupId) return { kind: "group", memberId: member.actorGroupId };
  throw new Error("This membership has no user, machine identity or group.");
};

const memberKind = (member: TPkiApplicationMember): TPkiApplicationMemberKind | undefined => {
  if (member.actorUserId) return "user";
  if (member.actorIdentityId) return "identity";
  if (member.actorGroupId) return "group";
  return undefined;
};

const memberName = (member: TPkiApplicationMember) =>
  member.details?.name?.trim() ||
  member.details?.username?.trim() ||
  member.details?.email?.trim() ||
  member.details?.slug?.trim() ||
  member.actorUserId ||
  member.actorIdentityId ||
  member.actorGroupId ||
  "Unknown member";

const memberDetail = (member: TPkiApplicationMember) => {
  const name = memberName(member);
  const email = member.details?.email?.trim();
  return email && email !== name ? email : undefined;
};

export const MembersTab = ({
  projectId,
  application,
  access
}: {
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const { data, isPending } = adapter.useApplicationMembers(application.id);
  const updateRole = adapter.useUpdateMemberRole();
  const remove = adapter.useRemoveMember();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TPkiApplicationMember>();
  const [removePending, setRemovePending] = useState(false);
  const members = data ?? [];
  const can = (action: PkiApplicationResourceActions) =>
    appCan(access, action, PkiApplicationResourceSub.Member);
  const canAdd = can(PkiApplicationResourceActions.Create);
  const canEdit = can(PkiApplicationResourceActions.Edit);
  const canDelete = can(PkiApplicationResourceActions.Delete);

  const changeRole = async (member: TPkiApplicationMember, role: string) => {
    if (role === member.role) return;
    try {
      await updateRole.mutateAsync({ applicationId: application.id, ...memberRef(member), role });
    } catch (error) {
      failed("Failed to update role", error);
      return;
    }
    saved(
      `${memberName(member)} is now ${APP_ROLES.find((entry) => entry.value === role)?.label ?? role}`
    );
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemovePending(true);
    try {
      await remove.mutateAsync({ applicationId: application.id, ...memberRef(removing) });
      saved(`Removed ${memberName(removing)}`);
      setRemoving(undefined);
    } catch (error) {
      failed("Failed to remove member", error);
    } finally {
      setRemovePending(false);
    }
  };

  const columns: DataTableColumn<TPkiApplicationMember>[] = [
    {
      id: "member",
      header: "Member",
      primary: true,
      grow: true,
      text: memberName,
      secondary: memberDetail,
      render: memberName
    },
    {
      id: "type",
      header: "Type",
      width: 160,
      render: (member) => {
        const kind = memberKind(member);
        return kind ? (
          <Badge tone="outline" size="sm">
            {kindLabel[kind]}
          </Badge>
        ) : (
          "Unknown"
        );
      }
    },
    {
      id: "role",
      header: "Role",
      width: 176,
      render: (member) => (
        <Select
          size="sm"
          aria-label={`Role for ${memberName(member)}`}
          options={APP_ROLES}
          value={member.role}
          disabled={!canEdit}
          onChange={(role) => changeRole(member, role)}
        />
      )
    },
    {
      id: "added",
      header: "Added",
      width: 140,
      render: (member) => formatDate(member.createdAt)
    }
  ];

  return (
    <Stack gap={16}>
      <Inline gap={8} align="center" justify="end">
        <Button
          variant="outline"
          icon="user-plus"
          disabledReason={canAdd ? undefined : RESTRICTED}
          onClick={() => setAdding(true)}
        >
          Add members
        </Button>
      </Inline>
      <DataTable
        label={`Members of ${application.name}`}
        rows={members}
        loading={isPending}
        columns={columns}
        getRowId={(member) => member.membershipId}
        rowLabel={memberName}
        rowActions={{
          renderMenu: (member) => (
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              description={canDelete ? undefined : RESTRICTED}
              onSelect={() => setRemoving(member)}
            >
              <Icon name="trash" />
              Remove member
            </DropdownMenuItem>
          )
        }}
        empty={
          <EmptyState
            size="sm"
            icon="users"
            title="No members yet"
            description="Add a user, machine identity or group to grant access to this application."
          />
        }
        persistentStatus={members.length ? plural(members.length, "member", "members") : undefined}
      />
      {adding && (
        <AddMemberDialog
          projectId={projectId}
          applicationId={application.id}
          existingMembers={members}
          onClose={() => setAdding(false)}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm" pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing ? memberName(removing) : "member"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this application at once. Their access to other applications
              doesn&apos;t change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removePending}
              onClick={(event) => {
                event.preventDefault();
                confirmRemove();
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
