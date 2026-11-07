import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import { useParams, useSearch } from "@tanstack/react-router";

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
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { supportsAssumePrivileges } from "@app/helpers/project";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  FilterMemberType,
  GroupMembersOrderBy,
  GroupMemberType,
  type TGroup
} from "@app/hooks/api/groups/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { formatDate, formatDateTime } from "../roles";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, ListToolbar, RESTRICTED, type Sort } from "../ui";
import { RemoveGroupDialog } from "./group-modal";
import { GroupRoles } from "./group-roles";
import { personName } from "./member-access";
import { useProjectScope } from "./scope";

import styles from "./group.module.css";

const ASSUME_CONFIRM = "assume";

type Member = {
  id: string;
  type: GroupMemberType;
  name: string;
  email?: string;
  joinedGroupAt: Date;
};

const AssumeMemberDialog = ({
  projectId,
  member,
  onOpenChange
}: {
  projectId: string;
  member?: Member;
  onOpenChange: (open: boolean) => void;
}) => {
  const scope = useProjectScope();
  const assume = useV4Adapter("access").useAssumeProjectPrivileges();
  const isIdentity = member?.type === GroupMemberType.MACHINE_IDENTITY;
  const noun = isIdentity ? "machine identity" : "user";
  const confirm = async () => {
    if (!member) return;
    try {
      await assume.mutateAsync({
        actorId: member.id,
        actorType: isIdentity ? ActorType.IDENTITY : ActorType.USER,
        projectId
      });
      saved(`${isIdentity ? "Machine identity" : "User"} privilege assumption has started`);
      onOpenChange(false);
      window.location.assign(accessLinks.project(scope));
    } catch (error) {
      failed("Failed to assume privileges", error);
    }
  };
  return (
    <AlertDialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <AlertDialogContent confirmText={ASSUME_CONFIRM}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Assume privileges of this ${noun}`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <Alert tone="warn">
                <AlertDescription>
                  {`Your privileges become this ${noun}'s for one hour.`}
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            Assume privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const useDebounced = (value: string, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const GroupMembersCard = ({
  projectId,
  group,
  initialSearch
}: {
  projectId: string;
  group: TGroup;
  initialSearch?: string;
}) => {
  const { permission } = useProjectPermission(projectId);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [typeFilter, setTypeFilter] = useState<FilterMemberType[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [assuming, setAssuming] = useState<Member>();
  const debouncedSearch = useDebounced(search.trim());

  const query = useV4Adapter("access").useGroupMembers({
    id: group.id,
    groupSlug: group.slug,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch,
    orderBy: GroupMembersOrderBy.Name,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    memberTypeFilter: typeFilter.length ? typeFilter : undefined
  });
  const totalCount = query.data?.totalCount ?? 0;

  useEffect(() => {
    if (page > 1 && (page - 1) * perPage >= totalCount && !query.isPending) setPage(1);
  }, [page, perPage, totalCount, query.isPending]);

  const members: Member[] = (query.data?.members ?? []).map((member) =>
    member.type === GroupMemberType.USER
      ? {
          id: member.id,
          type: member.type,
          name: personName(member.user) ?? member.user.username,
          email: member.user.email,
          joinedGroupAt: member.joinedGroupAt
        }
      : {
          id: member.machineIdentity.id,
          type: member.type,
          name: member.machineIdentity.name,
          joinedGroupAt: member.joinedGroupAt
        }
  );

  const scope = useProjectScope();
  const assumeBlocked = (member: Member) => {
    if (!supportsAssumePrivileges(scope.projectType)) return RESTRICTED;
    const allowed =
      member.type === GroupMemberType.USER
        ? permission.can(
            ProjectPermissionMemberActions.AssumePrivileges,
            subject(ProjectPermissionSub.Member, { userEmail: member.email ?? "" })
          )
        : permission.can(
            ProjectPermissionIdentityActions.AssumePrivileges,
            ProjectPermissionSub.Identity
          );
    return allowed ? undefined : RESTRICTED;
  };

  const columns: DataTableColumn<Member>[] = [
    {
      id: "type",
      header: "Member type",
      width: 40,
      render: (member) => (
        <span className={styles.memberIcon}>
          <Icon name={member.type === GroupMemberType.USER ? "user" : "machine"} />
        </span>
      )
    },
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
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
      render: (member) => <span>{formatDate(member.joinedGroupAt)}</span>
    }
  ];

  const rowActions: DataTableRowActions<Member> = {
    inline: [
      {
        label: "Assume privileges",
        icon: "user",
        disabledReason: assumeBlocked,
        onSelect: setAssuming
      }
    ]
  };

  const filtered = Boolean(search.trim()) || typeFilter.length > 0;
  const hasRows = query.isPending || members.length > 0;
  return (
    <>
      <Card
        variant="framed"
        title="Group members"
        flush={hasRows}
        action={
          <ListToolbar
            band
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search group members..."
            filter={{
              label: "Filter by member type",
              options: [
                { value: FilterMemberType.USERS, label: "Users" },
                { value: FilterMemberType.MACHINE_IDENTITIES, label: "Machine identities" }
              ],
              selected: typeFilter,
              onToggle: (value) => {
                const type = value as FilterMemberType;
                setTypeFilter((current) =>
                  current.includes(type)
                    ? current.filter((item) => item !== type)
                    : [...current, type]
                );
                setPage(1);
              }
            }}
          />
        }
      >
        {hasRows && (
          <DataTable
            label="Group members"
            rows={members}
            columns={columns}
            rowActions={rowActions}
            getRowId={(member) => `${member.type}-${member.id}`}
            rowLabel={(member) => member.email ?? member.name}
            loading={query.isPending}
            loadingRows={5}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            pagination={
              !query.isPending && totalCount > 0 ? (
                <Pagination
                  page={page}
                  total={totalCount}
                  pageSize={perPage}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPerPage(size);
                    setPage(1);
                  }}
                />
              ) : undefined
            }
          />
        )}
        {!hasRows &&
          (filtered ? (
            <EmptyState size="sm" icon="search" title="No group members match your filters" />
          ) : (
            <EmptyState
              size="sm"
              icon="user"
              title="This group doesn't have any members"
              description="Add members from organization access control."
            />
          ))}
      </Card>
      <AssumeMemberDialog
        projectId={projectId}
        member={assuming}
        onOpenChange={(open) => !open && setAssuming(undefined)}
      />
    </>
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

const BackLink = ({ href }: { href: string }) => (
  <div>
    <Button variant="link" icon="chev-left" asChild>
      <a href={href}>Project groups</a>
    </Button>
  </div>
);

export const ProjectGroupDetail = () => {
  const scope = useProjectScope();
  const { projectId } = scope;
  const { groupId = "" } = useParams({ strict: false });
  const { username } = useSearch({ strict: false });
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const query = useV4Adapter("access").useProjectGroup(projectId, groupId, scope.projectType);
  const [removing, setRemoving] = useState(false);
  const back = accessLinks.project(scope, ProjectAccessControlTabs.Groups);

  if (permissionPending || query.isPending) return <Loader size="page" label="Loading group" />;
  if (!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups))
    return (
      <Stack gap={32}>
        <BackLink href={back} />
        <AccessRestricted requirement="read Groups" />
      </Stack>
    );

  const membership = query.data;
  if (!membership)
    return (
      <Stack gap={32}>
        <BackLink href={back} />
        <EmptyState icon="alert" title="Group not found" />
      </Stack>
    );

  const { group } = membership;
  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <BackLink href={back} />
        <PageHeader
          title={group.name}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={
                    !permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Groups)
                  }
                  description={
                    permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Groups)
                      ? undefined
                      : RESTRICTED
                  }
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
      <DetailLayout
        asideLabel="Details"
        aside={
          <Card variant="framed" title="Details">
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
                    projectId={projectId}
                    groupId={group.id}
                    groupName={group.name}
                    roles={membership.roles}
                  />
                ],
                ["Joined project", formatDateTime(membership.createdAt)]
              ]}
            />
          </Card>
        }
      >
        <GroupMembersCard projectId={projectId} group={group} initialSearch={username} />
      </DetailLayout>
      <RemoveGroupDialog
        projectId={projectId}
        group={removing ? group : undefined}
        onOpenChange={setRemoving}
        onRemoved={() => go(back)}
      />
    </Stack>
  );
};
