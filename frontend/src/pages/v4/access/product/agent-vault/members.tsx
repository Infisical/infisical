import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { UserXIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
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
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { useProjectPermission } from "../../permissions";
import { useProjectScope } from "../../project/scope";
import { failed, saved } from "../../toast";
import { Gate, Muted } from "../../ui";
import { InviteMembersDialog } from "./members-invite-dialog";
import {
  ChangeRoleDialog,
  memberDisplayName,
  PendingInvitationBadge,
  ProductRoleBadge,
  useMemberList
} from "./shared";

type UserMember = TAgentVaultProductMemberOf<AgentVaultMemberType.User>;

const SELF_REASON = "You cannot modify your own membership";

export const AgentVaultMembersTab = () => {
  const { projectId } = useProjectScope();
  const session = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const revoke = useV4Adapter("agentVault").useRevokeMembers(projectId);
  const list = useMemberList(projectId, AgentVaultMemberType.User);
  const requesterEmail = useSearch({
    strict: false,
    select: (search) => (search as { requesterEmail?: string }).requesterEmail
  });
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserMember>();
  const [removing, setRemoving] = useState<UserMember>();

  const canAdd = permission.can(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member);

  useEffect(() => {
    if (requesterEmail && canAdd) setInviting(true);
  }, [requesterEmail, canAdd]);

  const columns: DataTableColumn<UserMember>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      render: (member) => {
        const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
        return name ? <span title={name}>{name}</span> : <Muted>-</Muted>;
      }
    },
    {
      id: "email",
      header: "Email",
      grow: true,
      render: (member) => <span>{member.email || member.username}</span>
    },
    {
      id: "role",
      header: "Product role",
      render: (member) => (
        <Inline gap={8}>
          <ProductRoleBadge role={member.role} />
          {member.isOrgMembershipPending && <PendingInvitationBadge />}
        </Inline>
      )
    }
  ];

  const remove = async () => {
    const member = removing;
    setRemoving(undefined);
    if (!member) return;
    try {
      await revoke.mutateAsync({ userIds: [member.id] });
      saved(`${memberDisplayName(member)} removed`);
    } catch (error) {
      failed("Failed to remove user", error);
    }
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="User filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search users..."
            placeholder="Search users..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canAdd} reason="You don't have permission to add users to this project">
            <Button
              variant="accent"
              icon="user-plus"
              disabled={!canAdd}
              onClick={() => setInviting(true)}
            >
              Add users
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Users"
        rows={list.rows}
        columns={columns}
        rowActions={{
          menuDisabledReason: (member) =>
            member.email === session.user.email ? SELF_REASON : undefined,
          renderMenu: (member) => (
            <>
              <DropdownMenuItem onSelect={() => setEditing(member)}>
                <Icon name="user" />
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
                <Icon icon={UserXIcon} />
                Remove
              </DropdownMenuItem>
            </>
          )
        }}
        getRowId={(member) => member.id}
        rowLabel={memberDisplayName}
        loading={list.isPending}
        loadingRows={10}
        empty={
          (Boolean(list.error) && (
            <EmptyState size="sm" icon="alert" title="Couldn't load users" />
          )) ||
          (list.searching ? (
            <EmptyState size="sm" icon="search" title="No users match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No users yet" />
          ))
        }
        pagination={list.pagination}
      />
      <InviteMembersDialog projectId={projectId} open={inviting} onOpenChange={setInviting} />
      <ChangeRoleDialog
        projectId={projectId}
        member={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing ? memberDisplayName(removing) : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing ? memberDisplayName(removing) : "user"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              They lose every access bundle granted to them. Any active session they hold stops
              reaching its hosts at the next proxy poll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
