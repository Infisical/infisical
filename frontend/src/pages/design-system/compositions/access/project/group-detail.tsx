import { useMemo, useState } from "react";
import { format } from "date-fns";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import type { OrgGroup } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { ListToolbar, useCan, usePagedList } from "../ui";
import { GroupRoles } from "./group-roles";

import styles from "./group.module.css";

const groupIdentityMembers: Record<string, string[]> = {
  "g-platform": ["4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11", "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36"]
};

const ASSUME_CONFIRM = "assume";

type MemberType = "users" | "machine-identities";
type Member = {
  id: string;
  type: MemberType;
  name: string;
  email?: string;
  joinedGroupAt: string;
};

const backToGroups = { scope: "project", projectTab: "groups" } as const;

export const RemoveGroupDialog = ({
  group,
  onOpenChange,
  onRemoved
}: {
  group?: OrgGroup;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) => {
  const { update, saved } = useAccess();
  return (
    <AlertDialog open={Boolean(group)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText={group?.name ?? ""}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove "${group?.name ?? ""}" from project?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the group&apos;s access to this project. You can add the group again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!group) return;
              update((current) => ({
                ...current,
                projectGroups: current.projectGroups.filter((item) => item.groupId !== group.id)
              }));
              onOpenChange(false);
              saved("Successfully removed group from project");
              onRemoved?.();
            }}
          >
            Remove group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const AssumePrivilegesDialog = ({
  member,
  onOpenChange
}: {
  member?: Member;
  onOpenChange: (open: boolean) => void;
}) => {
  const { toast } = useAccess();
  const noun = member?.type === "machine-identities" ? "machine identity" : "user";
  return (
    <AlertDialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <AlertDialogContent confirmText={ASSUME_CONFIRM}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Assume privileges of this ${noun}`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <Alert tone="warn">
                <AlertDescription>
                  {`This will set your privileges to those of the ${noun} for the next hour.`}
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            onClick={() => {
              onOpenChange(false);
              toast({
                tone: "ok",
                title: `${noun === "user" ? "User" : "Machine identity"} privilege assumption has started`,
                description: "Local demo only. Your privileges did not change."
              });
            }}
          >
            Assume privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const GroupMembersTable = ({ group }: { group: OrgGroup }) => {
  const { data, loading } = useAccess();
  const can = useCan("project");
  const [typeFilter, setTypeFilter] = useState<MemberType[]>([]);
  const [assuming, setAssuming] = useState<Member>();

  const members = useMemo<Member[]>(() => {
    const joinedGroupAt = new Date(group.createdAt).toLocaleDateString("en-US");
    const users = group.memberIds.flatMap((userId) => {
      const member = data.orgMembers.find((item) => item.user.id === userId);
      if (!member) return [];
      const { firstName, lastName, email } = member.user;
      return [
        {
          id: userId,
          type: "users" as const,
          name: `${firstName ?? "-"} ${lastName ?? ""}`,
          email,
          joinedGroupAt
        }
      ];
    });
    const identities = (groupIdentityMembers[group.id] ?? []).flatMap((identityId) => {
      const identity = data.orgIdentities.find((item) => item.id === identityId);
      return identity
        ? [
            {
              id: identityId,
              type: "machine-identities" as const,
              name: identity.name,
              joinedGroupAt
            }
          ]
        : [];
    });
    return [...users, ...identities].filter(
      (member) => !typeFilter.length || typeFilter.includes(member.type)
    );
  }, [group, data.orgMembers, data.orgIdentities, typeFilter]);

  const list = usePagedList({
    rows: members,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [member.name, member.email].some((value) => value?.toLowerCase().includes(needle)),
    compare: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  });

  const columns: AccessColumn<Member>[] = [
    {
      id: "type",
      header: "Member type",
      width: 40,
      skeleton: 16,
      render: (member) => (
        <span className={styles.memberIcon}>
          <Icon name={member.type === "users" ? "user" : "machine"} />
        </span>
      )
    },
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "50%",
      render: (member) => (
        <span>
          {member.name}
          {member.email && <span className={styles.muted}>{` (${member.email})`}</span>}
        </span>
      )
    },
    {
      id: "joined",
      header: "Joined group",
      render: (member) => <span>{member.joinedGroupAt}</span>
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (member) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {member.type === "users"
                ? `Actions for ${member.email}`
                : `Actions for machine identity ${member.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!can(member.type === "users" ? "member" : "identity", "edit")}
              onSelect={() => setAssuming(member)}
            >
              <Icon name="user" />
              Assume privileges
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const filtered = Boolean(list.search.trim()) || typeFilter.length > 0;
  return (
    <Stack gap={16}>
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        placeholder="Search group members..."
        filter={{
          label: "Filter by member type",
          options: [
            { value: "users", label: "Users" },
            { value: "machine-identities", label: "Machine identities" }
          ],
          selected: typeFilter,
          onToggle: (value) => {
            const type = value as MemberType;
            setTypeFilter((current) =>
              current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
            );
            list.resetPage();
          }
        }}
      />
      <Stack gap={8}>
        <AccessTable
          label="Group members"
          rows={list.pageRows}
          columns={columns}
          getRowId={(member) => `${member.type}-${member.id}`}
          rowLabel={(member) => member.email ?? member.name}
          loading={loading ? 5 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={
            filtered ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No group members match your filters"
                description="Adjust your search or filters to view group members."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="user"
                title="This group doesn't have any members"
                description="Assign members from organization access control or contact an organization admin."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      <AssumePrivilegesDialog
        member={assuming}
        onOpenChange={(open) => !open && setAssuming(undefined)}
      />
    </Stack>
  );
};

const CopyGroupId = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Group ID copied" : "Copy group ID"}>
      <Button
        variant="ghost"
        size="icon-row"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={() => {
          navigator.clipboard?.writeText(id);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        Copy group ID
      </Button>
    </Tooltip>
  );
};

const BackLink = () => {
  const { navigate } = useAccess();
  return (
    <div>
      <Button variant="link" icon="chev-left" onClick={() => navigate(backToGroups)}>
        Project groups
      </Button>
    </div>
  );
};

export const ProjectGroupDetail = ({ id }: { id: string }) => {
  const { data, loading, navigate, toast } = useAccess();
  const can = useCan("project");
  const [removing, setRemoving] = useState(false);
  const membership = data.projectGroups.find((item) => item.groupId === id);
  const group = data.orgGroups.find((item) => item.id === id);

  if (loading)
    return (
      <Stack gap={24} role="status" aria-label="Loading group details" aria-busy>
        <Skeleton width={144} height={16} />
        <Stack gap={8}>
          <Skeleton width={256} height={32} />
          <Skeleton width={320} height={16} />
        </Stack>
        <div className={styles.columns}>
          <Skeleton width="100%" height={256} />
          <Skeleton width="100%" height={256} />
        </div>
      </Stack>
    );

  if (!membership || !group)
    return (
      <Stack gap={32}>
        <BackLink />
        <EmptyState
          icon="alert"
          title="Group not found"
          description="This group is unavailable or is no longer assigned to the project."
        />
      </Stack>
    );

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <BackLink />
        <PageHeader
          title={group.name}
          description="Configure and manage project access control"
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" iconRight="more">
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(group.id);
                    toast({ tone: "neutral", title: "Group ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy group ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!can("groups", "delete")}
                  onSelect={() => setRemoving(true)}
                >
                  <Icon name="trash" />
                  Remove from project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Stack>
      <div className={styles.columns}>
        <Card title="Details" description="Group details">
          <DataList
            variant="props"
            items={[
              ["Name", group.name],
              [
                "ID",
                <span key="id" className={styles.idValue}>
                  {group.id}
                  <CopyGroupId id={group.id} />
                </span>
              ],
              [
                "Project role",
                <GroupRoles
                  key="roles"
                  groupId={group.id}
                  groupName={group.name}
                  roles={membership.roles}
                />
              ],
              ["Joined project", format(new Date(membership.createdAt), "PPpp")]
            ]}
          />
        </Card>
        <Card title="Group members" description="View members of this group">
          <GroupMembersTable group={group} />
        </Card>
      </div>
      <RemoveGroupDialog
        group={removing ? group : undefined}
        onOpenChange={setRemoving}
        onRemoved={() => navigate(backToGroups)}
      />
    </Stack>
  );
};
