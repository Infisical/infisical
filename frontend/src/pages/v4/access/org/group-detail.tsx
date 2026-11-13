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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack, Inline } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import {
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  FilterMemberType,
  GroupMembersOrderBy,
  GroupMemberType,
  type TGroup,
  type TGroupMember
} from "@app/hooks/api/groups/types";
import { SearchIdentitiesScope } from "@app/hooks/api/identities/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDate, orgRoleName, orgRoleSlug } from "../roles";
import { failed, saved, toast } from "../toast";
import { Gate, ListToolbar, Muted, RESTRICTED, type Sort } from "../ui";
import { BackButton, CopyButton, Value } from "./detail-parts";
import { GroupDialog } from "./group-dialog";
import { ProjectMembershipsSection } from "./project-memberships";
import { useDebounced } from "./use-debounced";
import { displayName } from "./users";

import css from "./org.module.css";

const memberName = (member: TGroupMember) =>
  member.type === GroupMemberType.USER
    ? (displayName(member.user) ?? member.user.email ?? member.user.username)
    : member.machineIdentity.name;

const memberEmail = (member: TGroupMember) =>
  member.type === GroupMemberType.USER && displayName(member.user)
    ? member.user.email || member.user.username
    : undefined;

const AddMembersDialog = ({
  group,
  onOpenChange
}: {
  group: TGroup;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const addUser = access.useAddUserToGroup();
  const addIdentity = access.useAddIdentityToGroup();
  const { data: users = [] } = access.useOrgUsers(orgId);
  const { data: identities } = access.useSearchOrgIdentities({
    orgId,
    offset: 0,
    limit: 100,
    scope: [SearchIdentitiesScope.OrganizationScope],
    search: {}
  });
  const { data: identityMembers } = access.useGroupMembers({
    id: group.id,
    groupSlug: group.slug,
    offset: 0,
    limit: 100,
    search: "",
    memberTypeFilter: [FilterMemberType.MACHINE_IDENTITIES]
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const memberIdentityIds = new Set(identityMembers?.members.map((member) => member.id));
  const options = [
    ...users
      .filter(
        (member) => member.membership && !member.groups.some((entry) => entry.id === group.id)
      )
      .map((member) => ({
        value: `user:${member.user.username}`,
        label: displayName(member.user) ?? member.user.username,
        description: member.user.email ?? undefined,
        group: "Users"
      })),
    ...(identities?.identities ?? [])
      .filter((row) => !memberIdentityIds.has(row.identity.id))
      .map((row) => ({
        value: `identity:${row.identity.id}`,
        label: row.identity.name,
        group: "Machine identities"
      }))
  ];
  const count = selected.length;
  const plural = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

  const assign = async () => {
    setPending(true);
    const results = await Promise.allSettled(
      selected.map((value) => {
        const [kind, id] = value.split(/:(.*)/s);
        return kind === "user"
          ? addUser.mutateAsync({ groupId: group.id, slug: group.slug, username: id })
          : addIdentity.mutateAsync({ groupId: group.id, slug: group.slug, identityId: id });
      })
    );
    setPending(false);
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failure = results.find((result) => result.status === "rejected");
    if (succeeded) saved(`Successfully assigned ${plural(succeeded)} to the group`);
    if (failure)
      failed(`Failed to assign ${plural(results.length - succeeded)} to the group`, failure.reason);
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add group members</DialogTitle>
        </DialogHeader>
        <Field label="Members">
          <MultiSelect
            label="Members"
            searchable
            placeholder={
              options.length
                ? "Search and select users or machine identities..."
                : "All members are already in the group"
            }
            disabled={!options.length}
            options={options}
            value={selected}
            onChange={setSelected}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!count} loading={pending} onClick={assign}>
            {count ? `Assign ${plural(count)}` : "Assign members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GroupMembersSection = ({ group, canEdit }: { group: TGroup; canEdit: boolean }) => {
  const access = useV4Adapter("access");
  const removeUser = access.useRemoveUserFromGroup();
  const removeIdentity = access.useRemoveIdentityFromGroup();
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<FilterMemberType[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TGroupMember>();
  const debouncedSearch = useDebounced(search.trim());
  const { data, isPending } = access.useGroupMembers({
    id: group.id,
    groupSlug: group.slug,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch,
    orderBy: GroupMembersOrderBy.Name,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    memberTypeFilter: kinds.length ? kinds : undefined
  });
  const members = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtered = Boolean(debouncedSearch || kinds.length);
  const hasRows = isPending || members.length > 0;
  const addButton = (
    <Gate allowed={canEdit}>
      <Button
        variant="accent"
        size="xs"
        icon="plus"
        disabled={!canEdit}
        onClick={() => setAdding(true)}
      >
        Add member
      </Button>
    </Gate>
  );
  const columns: DataTableColumn<TGroupMember>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (member) => {
        const isUser = member.type === GroupMemberType.USER;
        const email = memberEmail(member);
        return (
          <Inline gap={8} wrap={false}>
            <span
              className={css.typeIcon}
              role="img"
              aria-label={isUser ? "User" : "Machine identity"}
            >
              <Icon name={isUser ? "user" : "machine"} size={14} />
            </span>
            <span>{memberName(member)}</span>
            {email && <Muted>{`(${email})`}</Muted>}
          </Inline>
        );
      }
    },
    { id: "added", header: "Added on", render: (member) => formatDate(member.joinedGroupAt) }
  ];

  const rowActions: DataTableRowActions<TGroupMember> = {
    renderMenu: (member) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={() => setRemoving(member)}
      >
        <Icon name="trash" />
        {member.type === GroupMemberType.USER
          ? "Remove user from group"
          : "Remove identity from group"}
      </DropdownMenuItem>
    )
  };

  const remove = async (member: TGroupMember) => {
    try {
      if (member.type === GroupMemberType.USER) {
        await removeUser.mutateAsync({
          groupId: group.id,
          slug: group.slug,
          username: member.user.username
        });
        saved(`Successfully removed user ${member.user.username} from the group`);
      } else {
        await removeIdentity.mutateAsync({
          groupId: group.id,
          slug: group.slug,
          identityId: member.machineIdentity.id
        });
        saved(`Successfully removed identity ${member.machineIdentity.name} from the group`);
      }
    } catch (error) {
      failed("Failed to remove member from the group", error);
    }
  };

  return (
    <>
      <Card
        variant="framed"
        title="Group members"
        flush={hasRows}
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              band
              search={search}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search members..."
              filter={{
                label: "Filter by member type",
                options: [
                  { value: FilterMemberType.USERS, label: "Users" },
                  { value: FilterMemberType.MACHINE_IDENTITIES, label: "Machine identities" }
                ],
                selected: kinds,
                onToggle: (kind) => {
                  setKinds((current) =>
                    current.includes(kind as FilterMemberType)
                      ? current.filter((k) => k !== kind)
                      : [...current, kind as FilterMemberType]
                  );
                  setPage(1);
                }
              }}
            />
            {addButton}
          </Inline>
        }
      >
        {hasRows && (
          <DataTable
            label={`Members of ${group.name}`}
            rows={members}
            columns={columns}
            rowActions={rowActions}
            getRowId={(member) => `${member.type}:${member.id}`}
            rowLabel={memberName}
            loading={isPending}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            pagination={
              !isPending && totalCount > 0 ? (
                <Pagination
                  variant="compact"
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
            <EmptyState size="sm" icon="search" title="No members match this search" />
          ) : (
            <EmptyState size="sm" icon="user" title="This group does not have any members" />
          ))}
      </Card>
      {adding && <AddMembersDialog group={group} onOpenChange={setAdding} />}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove ${removing ? (memberEmail(removing) ?? memberName(removing)) : ""} from the group?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose any access granted through this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (removing) await remove(removing);
                setRemoving(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const OrgGroupDetail = () => {
  const { groupId } = useParams({ from: "/v4/organizations/$orgId/groups/$groupId" });
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission } = useOrgPermission();
  const { data, isPending } = access.useGroup(groupId);
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const remove = access.useDeleteGroup();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const back = () => go(accessLinks.org(orgId, OrgAccessControlTabSections.Groups));
  if (isPending) return <Loader size="page" label="Loading group" />;
  const group = data?.group;
  if (!group)
    return (
      <EmptyState
        icon="user"
        title="Group not found"
        actions={
          <Button variant="outline" onClick={back}>
            Back to groups
          </Button>
        }
      />
    );
  const canEdit = permission.can(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);
  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <Stack gap={8}>
          <BackButton label="Organization groups" onClick={back} />
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
                  <DropdownMenuItem
                    disabled={!canEdit}
                    description={canEdit ? undefined : RESTRICTED}
                    onSelect={() => setEditing(true)}
                  >
                    <Icon icon={PencilIcon} />
                    Edit group
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={
                      !permission.can(
                        OrgPermissionGroupActions.Delete,
                        OrgPermissionSubjects.Groups
                      )
                    }
                    description={
                      permission.can(OrgPermissionGroupActions.Delete, OrgPermissionSubjects.Groups)
                        ? undefined
                        : RESTRICTED
                    }
                    onSelect={() => setDeleting(true)}
                  >
                    <Icon name="trash" />
                    Delete group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </Stack>
        <DetailLayout
          asideLabel="Details"
          aside={
            <Card
              variant="framed"
              title="Details"
              action={
                <Gate allowed={canEdit}>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Edit group"
                    disabled={!canEdit}
                    onClick={() => setEditing(true)}
                  >
                    <Icon icon={PencilIcon} size={12} />
                  </Button>
                </Gate>
              }
            >
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Name", group.name],
                  [
                    "ID",
                    <Value key="id" mono>
                      {group.id}
                      <CopyButton value={group.id} label="Copy group ID to clipboard" />
                    </Value>
                  ],
                  [
                    "Slug",
                    <Value key="slug">
                      {group.slug}
                      <CopyButton value={group.slug} label="Copy slug to clipboard" />
                    </Value>
                  ],
                  ["Organization role", orgRoleName(roles, group)],
                  ["Created", formatDate(group.createdAt)]
                ]}
              />
            </Card>
          }
        >
          <div className={css.column}>
            <GroupMembersSection group={group} canEdit={canEdit} />
            <ProjectMembershipsSection
              subject="group"
              subjectId={group.id}
              subjectName={group.name}
              canEdit={canEdit}
            />
          </div>
        </DetailLayout>
      </Stack>
      {editing && (
        <GroupDialog
          group={{
            id: group.id,
            name: group.name,
            slug: group.slug,
            roleSlug: orgRoleSlug(roles, group)
          }}
          roleLabel="Role"
          open
          onOpenChange={setEditing}
        />
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Are you sure you want to delete the group named ${group.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync({ id: group.id, organizationId: orgId });
                  saved(`Successfully deleted the ${group.name} group`);
                  back();
                } catch (error) {
                  failed("Failed to delete group", error);
                  setDeleting(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
