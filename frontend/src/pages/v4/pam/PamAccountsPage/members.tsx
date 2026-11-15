import { useMemo, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";

import type { TPamMember, TPamMembersData } from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { useOrgId } from "../../access/permissions";
import { failed, readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, useGo } from "../../links";
import { ConfirmAction } from "./confirm-action";

export type MemberScope = "account" | "folder";
type MemberKind = "user" | "group" | "identity";

const KIND_GROUP: Record<MemberKind, string> = {
  group: "Groups",
  identity: "Machine identities",
  user: "Users"
};

const EXPIRY_OPTIONS = [
  { value: "none", label: "No expiry" },
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" },
  { value: "14d", label: "2 weeks" },
  { value: "30d", label: "1 month" }
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ResolvedMember = {
  key: string;
  kind: MemberKind;
  id: string;
  member: TPamMember;
  name: string;
  subtitle: string;
  pendingInvite: boolean;
};

const isExpired = (expiresAt?: string | null) =>
  Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();

export const usePamDirectory = () => {
  const orgId = useOrgId();
  const access = useV4Adapter("access");
  const { data: projectId = "" } = access.usePamProjectId(orgId);
  const { data: projectUsers = [] } = access.useProjectUsers(projectId, true);
  const { data: projectGroups = [] } = access.useProjectGroups(projectId);
  const { data: identities = [] } = useV4Adapter("pam").useProductIdentities();

  return useMemo(() => {
    const users = projectUsers.map((membership) => ({
      id: membership.user.id,
      name:
        [membership.user.firstName, membership.user.lastName].filter(Boolean).join(" ") ||
        membership.user.username,
      email: membership.user.email ?? membership.inviteEmail ?? membership.user.username,
      pendingInvite: Boolean(membership.user.isOrgMembershipPending),
      isGroupMember: Boolean(membership.isGroupMember)
    }));
    const groups = projectGroups.map(({ group }) => ({ id: group.id, name: group.name }));
    const identityList = identities.flatMap((member) =>
      member.identityId ? [{ id: member.identityId, name: member.name }] : []
    );
    return {
      users,
      groups,
      identities: identityList,
      userMap: new Map(users.map((user) => [user.id, user])),
      groupMap: new Map(groups.map((group) => [group.id, group.name])),
      identityMap: new Map(identityList.map((identity) => [identity.id, identity.name]))
    };
  }, [projectUsers, projectGroups, identities]);
};

const resolveMembers = (
  data: TPamMembersData | undefined,
  directory: ReturnType<typeof usePamDirectory>
): ResolvedMember[] => [
  ...(data?.users ?? []).map((member) => {
    const info = member.userId ? directory.userMap.get(member.userId) : undefined;
    return {
      key: `user:${member.membershipId}`,
      kind: "user" as const,
      id: member.userId ?? "",
      member,
      name: info?.name ?? member.userId ?? "Unknown user",
      subtitle: info?.email ?? "",
      pendingInvite: Boolean(info?.pendingInvite)
    };
  }),
  ...(data?.groups ?? []).map((member) => ({
    key: `group:${member.membershipId}`,
    kind: "group" as const,
    id: member.groupId ?? "",
    member,
    name: (member.groupId && directory.groupMap.get(member.groupId)) || "Unknown group",
    subtitle: "Group",
    pendingInvite: false
  })),
  ...(data?.identities ?? []).map((member) => ({
    key: `identity:${member.membershipId}`,
    kind: "identity" as const,
    id: member.identityId ?? "",
    member,
    name: (member.identityId && directory.identityMap.get(member.identityId)) || "Unknown identity",
    subtitle: "Machine identity",
    pendingInvite: false
  }))
];

const targetOf = (kind: MemberKind, id: string) => {
  if (kind === "user") return { userId: id };
  if (kind === "group") return { groupId: id };
  return { identityId: id };
};

const useMemberActions = (scope: MemberScope, resourceId: string) => {
  const pamAccess = useV4Adapter("pamAccess");
  const mutations = {
    account: {
      add: {
        user: pamAccess.useAddAccountUser(),
        group: pamAccess.useAddAccountGroup(),
        identity: pamAccess.useAddAccountIdentity()
      },
      update: {
        user: pamAccess.useUpdateAccountUser(),
        group: pamAccess.useUpdateAccountGroup(),
        identity: pamAccess.useUpdateAccountIdentity()
      },
      remove: {
        user: pamAccess.useRemoveAccountUser(),
        group: pamAccess.useRemoveAccountGroup(),
        identity: pamAccess.useRemoveAccountIdentity()
      }
    },
    folder: {
      add: {
        user: pamAccess.useAddFolderUser(),
        group: pamAccess.useAddFolderGroup(),
        identity: pamAccess.useAddFolderIdentity()
      },
      update: {
        user: pamAccess.useUpdateFolderUser(),
        group: pamAccess.useUpdateFolderGroup(),
        identity: pamAccess.useUpdateFolderIdentity()
      },
      remove: {
        user: pamAccess.useRemoveFolderUser(),
        group: pamAccess.useRemoveFolderGroup(),
        identity: pamAccess.useRemoveFolderIdentity()
      }
    }
  }[scope];
  const resource = scope === "account" ? { accountId: resourceId } : { folderId: resourceId };
  const run = (
    mutation: { mutateAsync: (variables: never) => Promise<unknown> },
    variables: object
  ) => mutation.mutateAsync(variables as never);

  return {
    add: (kind: MemberKind, id: string, role: string, expiry: string | null) =>
      run(mutations.add[kind], { ...resource, ...targetOf(kind, id), role, expiry }),
    update: (kind: MemberKind, id: string, role: string) =>
      run(mutations.update[kind], { ...resource, ...targetOf(kind, id), role }),
    remove: (kind: MemberKind, id: string) =>
      run(mutations.remove[kind], { ...resource, ...targetOf(kind, id) })
  };
};

const AssignAccessDialog = ({
  scope,
  resourceId,
  existing,
  editing,
  onClose
}: {
  scope: MemberScope;
  resourceId: string;
  existing: ResolvedMember[];
  editing: ResolvedMember | null;
  onClose: () => void;
}) => {
  const directory = usePamDirectory();
  const { data: roles = [] } = useV4Adapter("pamAccess").useResourceRoles();
  const actions = useMemberActions(scope, resourceId);
  const defaultRole =
    roles.find(({ slug }) => slug === "connector")?.slug ?? roles[roles.length - 1]?.slug ?? "";
  const [assignee, setAssignee] = useState("");
  const [role, setRole] = useState("");
  const [expiry, setExpiry] = useState("none");
  const effectiveRole = role || editing?.member.role || defaultRole;
  const guard = useDiscardChangesGuard({
    isDirty: Boolean(assignee || role || expiry !== "none"),
    onDiscard: onClose
  });

  const taken = new Set(
    existing
      .filter(({ member }) => !isExpired(member.expiresAt))
      .map(({ kind, id }) => `${kind}:${id}`)
  );
  const options = editing
    ? [
        {
          value: `${editing.kind}:${editing.id}`,
          label: editing.name,
          group: KIND_GROUP[editing.kind]
        }
      ]
    : [
        ...directory.groups.map((group) => ({
          value: `group:${group.id}`,
          label: group.name,
          group: KIND_GROUP.group
        })),
        ...directory.identities.map((identity) => ({
          value: `identity:${identity.id}`,
          label: identity.name,
          group: KIND_GROUP.identity
        })),
        ...directory.users
          .filter((user) => !user.isGroupMember)
          .map((user) => ({
            value: `user:${user.id}`,
            label: user.name,
            description: user.email,
            group: KIND_GROUP.user
          }))
      ].filter(({ value }) => !taken.has(value));

  const completed = useRef(false);

  const submit = async () => {
    if (editing) {
      await actions
        .update(editing.kind, editing.id, effectiveRole)
        .catch(readableFailure("Failed to update role"));
      saved("Role updated");
    } else {
      const [kind, id] = assignee.split(":") as [MemberKind, string];
      await actions
        .add(kind, id, effectiveRole, expiry === "none" ? null : expiry)
        .catch(readableFailure("Failed to assign access"));
      saved("Access assigned");
    }
    completed.current = true;
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => {
          if (open) return;
          if (completed.current) onClose();
          else guard.requestDiscard();
        }}
        title={editing ? "Edit access" : "Assign access"}
        completeLabel={editing ? "Save" : "Assign"}
        onComplete={submit}
        steps={[
          {
            title: editing ? "Edit access" : "Assign access",
            disabledReason: editing || assignee ? undefined : "Pick an assignee",
            content: (
              <Stack gap={16}>
                <Field label="Assignee">
                  <Combobox
                    label="Assignee"
                    placeholder="Pick a user, group, or identity"
                    emptyText="No users, groups, or identities left to assign"
                    options={options}
                    disabled={Boolean(editing)}
                    value={editing ? `${editing.kind}:${editing.id}` : assignee}
                    onValueChange={setAssignee}
                  />
                </Field>
                <Field label="Role">
                  <Select
                    label="Role"
                    value={effectiveRole}
                    options={roles.map(({ slug, name, description }) => ({
                      value: slug,
                      label: name,
                      description
                    }))}
                    onValueChange={setRole}
                  />
                </Field>
                {!editing && (
                  <Field label="Expiry">
                    <Select
                      label="Expiry"
                      value={expiry}
                      options={EXPIRY_OPTIONS}
                      onValueChange={setExpiry}
                    />
                  </Field>
                )}
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="The access you started to assign will be lost."
      />
    </>
  );
};

const Expiry = ({ expiresAt }: { expiresAt?: string | null }) => {
  if (!expiresAt) return <StatusText icon="infinity">No expiry</StatusText>;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  let tone: "bad" | "warn" | "neutral" = "neutral";
  if (remaining <= 0) tone = "bad";
  else if (remaining < ONE_DAY_MS) tone = "warn";
  return (
    <Tooltip content={format(new Date(expiresAt), "MMMM do, yyyy 'at' h:mm a")}>
      <StatusText tone={tone} icon="clock" tabIndex={0}>
        {remaining <= 0 ? "Expired" : formatDistanceToNow(new Date(expiresAt), { addSuffix: true })}
      </StatusText>
    </Tooltip>
  );
};

const MemberCard = ({
  title,
  label,
  rows,
  action,
  empty,
  menu
}: {
  title: string;
  label: string;
  rows: ResolvedMember[];
  action?: React.ReactNode;
  empty: React.ReactNode;
  menu?: {
    disabledReason: (row: ResolvedMember) => string | undefined;
    render: (row: ResolvedMember) => React.ReactNode;
  };
}) => {
  const { data: roles = [] } = useV4Adapter("pamAccess").useResourceRoles();
  const columns: DataTableColumn<ResolvedMember>[] = [
    {
      id: "assignee",
      header: "Assignee",
      primary: true,
      grow: true,
      text: (row) => row.name,
      secondary: (row) => row.subtitle || undefined,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <span>{row.name}</span>
          {row.pendingInvite && <Badge tone="soft">Pending invite</Badge>}
        </Inline>
      )
    },
    {
      id: "role",
      header: "Role",
      width: 160,
      render: (row) => (
        <Badge tone="outline">
          {roles.find(({ slug }) => slug === row.member.role)?.name ?? row.member.role}
        </Badge>
      )
    },
    {
      id: "expiry",
      header: "Expiry",
      width: 168,
      render: (row) => <Expiry expiresAt={row.member.expiresAt} />
    }
  ];
  return (
    <Card
      variant="framed"
      flush
      title={title}
      badges={<Count tone="neutral">{rows.length}</Count>}
      action={action}
    >
      <DataTable
        label={label}
        rows={rows}
        columns={columns}
        getRowId={(row) => row.key}
        rowLabel={(row) => row.name}
        isRowMuted={(row) => isExpired(row.member.expiresAt)}
        rowActions={
          menu
            ? {
                menuLabel: "Member options",
                menuDisabledReason: menu.disabledReason,
                renderMenu: menu.render
              }
            : undefined
        }
        empty={empty}
      />
    </Card>
  );
};

export const MembersPanel = ({
  scope,
  resourceId,
  inheritFrom
}: {
  scope: MemberScope;
  resourceId: string;
  inheritFrom?: { folderId: string; folderName: string | null };
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const session = useV4Session();
  const pamAccess = useV4Adapter("pamAccess");
  const directory = usePamDirectory();
  const accountMembers = pamAccess.useAccountMembers(scope === "account" ? resourceId : "");
  const folderMembers = pamAccess.useFolderMembers(
    scope === "folder" ? resourceId : (inheritFrom?.folderId ?? "")
  );
  const actions = useMemberActions(scope, resourceId);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<ResolvedMember | null>(null);
  const [removing, setRemoving] = useState<ResolvedMember | null>(null);

  const direct = resolveMembers(
    scope === "account" ? accountMembers.data : folderMembers.data,
    directory
  );
  const inherited = scope === "account" ? resolveMembers(folderMembers.data, directory) : [];
  const loading =
    (scope === "account" && accountMembers.isPending) ||
    ((scope === "folder" || Boolean(inheritFrom)) && folderMembers.isPending);

  if (loading)
    return (
      <Stack gap={12}>
        <Skeleton height={32} width={240} />
        <Skeleton height={120} />
      </Stack>
    );

  return (
    <Stack gap={16}>
      <MemberCard
        title={scope === "account" ? "Direct permissions" : "Members"}
        label={scope === "account" ? "Direct permissions" : "Folder members"}
        rows={direct}
        action={
          <Button variant="outline" icon="user-plus" onClick={() => setAssigning(true)}>
            Assign access
          </Button>
        }
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="users"
            title={`No members assigned to this ${scope} yet`}
          />
        }
        menu={{
          disabledReason: (row) =>
            row.kind === "user" && row.id === session.user.id
              ? "You can't change your own access"
              : undefined,
          render: (row) => (
            <>
              <DropdownMenuItem onSelect={() => setEditing(row)}>
                <Icon name="pencil" />
                Edit role
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(row)}>
                <Icon name="trash" />
                Remove
              </DropdownMenuItem>
            </>
          )
        }}
      />
      {inheritFrom && inherited.length > 0 && (
        <MemberCard
          title="Inherited permissions"
          label="Inherited permissions"
          rows={inherited}
          action={
            <Link
              {...go.link(
                orgHref(
                  orgId,
                  `/pam/accounts?folderId=${inheritFrom.folderId}&tab=${PamSheetTab.Permissions}`
                )
              )}
            >
              {`Manage on ${inheritFrom.folderName ?? "folder"}`}
            </Link>
          }
          empty={null}
        />
      )}
      {(assigning || editing) && (
        <AssignAccessDialog
          scope={scope}
          resourceId={resourceId}
          existing={direct}
          editing={editing}
          onClose={() => {
            setAssigning(false);
            setEditing(null);
          }}
        />
      )}
      <ConfirmAction
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}`}
        description={`They lose the access this membership grants on this ${scope}.`}
        action="Remove"
        onConfirm={async () => {
          if (!removing) return false;
          try {
            await actions.remove(removing.kind, removing.id);
            saved("Member removed");
            return true;
          } catch (error) {
            failed("Failed to remove member", error);
            return false;
          }
        }}
      />
    </Stack>
  );
};
