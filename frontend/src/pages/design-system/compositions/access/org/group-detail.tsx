import { useMemo, useState } from "react";
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
import { Card } from "@app/components/v4/ui/card";
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
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";

import { useAccess } from "../context";
import { type AccessData, displayName, type OrgGroup } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, Muted, useCan, usePagedList } from "../ui";
import { BackButton, CopyButton, Section, Value } from "./detail-parts";
import { GroupDialog } from "./group-dialog";
import { ADDED_TODAY, reapGroup } from "./memberships";
import { ProjectMembershipsSection } from "./project-memberships";

import css from "./org.module.css";

type MemberKind = "user" | "identity";
type MemberRow = { kind: MemberKind; id: string; name: string; email?: string; addedOn: string };

const memberRows = (data: AccessData, group: OrgGroup): MemberRow[] => [
  ...group.memberIds.flatMap((id) => {
    const member = data.orgMembers.find((m) => m.user.id === id);
    if (!member) return [];
    const name = displayName(member.user);
    return [
      {
        kind: "user" as const,
        id,
        name: name ?? member.user.email,
        email: name ? member.user.email : undefined,
        addedOn: group.addedOn?.[id] ?? group.createdAt
      }
    ];
  }),
  ...(group.identityIds ?? []).flatMap((id) => {
    const identity = data.orgIdentities.find((i) => i.id === id);
    return identity
      ? [
          {
            kind: "identity" as const,
            id,
            name: identity.name,
            addedOn: group.addedOn?.[id] ?? group.createdAt
          }
        ]
      : [];
  })
];

const setMembership = (
  data: AccessData,
  group: OrgGroup,
  changes: { add?: { kind: MemberKind; id: string }[]; remove?: { kind: MemberKind; id: string } }
): AccessData => {
  const addUsers = (changes.add ?? []).filter((m) => m.kind === "user").map((m) => m.id);
  const addIdentities = (changes.add ?? []).filter((m) => m.kind === "identity").map((m) => m.id);
  const removed = changes.remove;
  return {
    ...data,
    orgGroups: data.orgGroups.map((item) =>
      item.id === group.id
        ? {
            ...item,
            memberIds: [...item.memberIds, ...addUsers].filter(
              (id) => !(removed?.kind === "user" && removed.id === id)
            ),
            identityIds: [...(item.identityIds ?? []), ...addIdentities].filter(
              (id) => !(removed?.kind === "identity" && removed.id === id)
            ),
            addedOn: {
              ...item.addedOn,
              ...Object.fromEntries([...addUsers, ...addIdentities].map((id) => [id, ADDED_TODAY]))
            }
          }
        : item
    ),
    orgMembers: data.orgMembers.map((member) => {
      if (addUsers.includes(member.user.id))
        return {
          ...member,
          groups: [
            ...member.groups,
            { id: group.id, name: group.name, roles: [{ role: group.role }] }
          ]
        };
      if (removed?.kind === "user" && removed.id === member.user.id)
        return { ...member, groups: member.groups.filter((ref) => ref.id !== group.id) };
      return member;
    })
  };
};

const AddMembersDialog = ({
  group,
  open,
  onOpenChange
}: {
  group: OrgGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved } = useAccess();
  const [selected, setSelected] = useState<string[]>([]);
  const options = [
    ...data.orgMembers
      .filter((member) => !group.memberIds.includes(member.user.id))
      .map((member) => ({
        value: `user:${member.user.id}`,
        label: displayName(member.user) ?? member.user.username,
        description: member.user.email,
        group: "Users"
      })),
    ...data.orgIdentities
      .filter((identity) => !identity.managedByProject && !group.identityIds?.includes(identity.id))
      .map((identity) => ({
        value: `identity:${identity.id}`,
        label: identity.name,
        group: "Machine identities"
      }))
  ];
  const close = (next: boolean) => {
    if (!next) setSelected([]);
    onOpenChange(next);
  };
  const count = selected.length;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add group members</DialogTitle>
          <DialogDescription>
            Search for members and assign them to this group. You can select multiple at once.
          </DialogDescription>
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
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!count}
            onClick={() => {
              update((current) =>
                setMembership(current, group, {
                  add: selected.map((value) => {
                    const [kind, id] = value.split(/:(.*)/s);
                    return { kind: kind as MemberKind, id };
                  })
                })
              );
              saved(`Successfully assigned ${count} member${count === 1 ? "" : "s"} to the group`);
              close(false);
            }}
          >
            {count ? `Assign ${count} member${count === 1 ? "" : "s"}` : "Assign members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GroupMembersSection = ({ group }: { group: OrgGroup }) => {
  const { data, update, saved } = useAccess();
  const can = useCan("org");
  const canEdit = can("groups", "edit");
  const [kinds, setKinds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MemberRow>();
  const rows = useMemo(
    () => memberRows(data, group).filter((row) => !kinds.length || kinds.includes(row.kind)),
    [data, group, kinds]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) =>
      [row.name, row.email].some((value) => value?.toLowerCase().includes(needle)),
    compare: (a, b) => a.name.localeCompare(b.name)
  });
  const filtered = Boolean(list.search.trim() || kinds.length);
  const addButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEdit}>
      <Button
        variant={variant}
        size="sm"
        icon="plus"
        disabled={!canEdit}
        onClick={() => setAdding(true)}
      >
        Add member
      </Button>
    </Gate>
  );
  const columns: AccessColumn<MemberRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "66%",
      render: (row) => (
        <>
          <span
            className={css.typeIcon}
            role="img"
            aria-label={row.kind === "user" ? "User" : "Machine identity"}
          >
            <Icon name={row.kind === "user" ? "user" : "machine"} size={14} />
          </span>
          <span>{row.name}</span>
          {row.email && <Muted>{`(${row.email})`}</Muted>}
        </>
      )
    },
    { id: "added", header: "Added on", render: (row) => row.addedOn },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${row.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={!canEdit}
              onSelect={() => setRemoving(row)}
            >
              <Icon name="trash" />
              {row.kind === "user" ? "Remove user from group" : "Remove identity from group"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <Section
      title="Group members"
      description="Manage members of this group"
      action={addButton("outline")}
    >
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        placeholder="Search members..."
        filter={{
          label: "Filter by member type",
          options: [
            { value: "user", label: "Users" },
            { value: "identity", label: "Machine identities" }
          ],
          selected: kinds,
          onToggle: (kind) => {
            setKinds((current) =>
              current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
            );
            list.resetPage();
          }
        }}
      />
      <AccessTable
        label={`Members of ${group.name}`}
        rows={list.pageRows}
        columns={columns}
        getRowId={(row) => `${row.kind}:${row.id}`}
        rowLabel={(row) => row.name}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          filtered ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No members match this search"
              description="Adjust search filters to view members."
            />
          ) : (
            <EmptyState
              size="sm"
              icon="user"
              title="This group does not have any members"
              description="Add users or machine identities to this group."
              actions={addButton("primary")}
            />
          )
        }
      />
      {list.pagination}
      <AddMembersDialog group={group} open={adding} onOpenChange={setAdding} />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove ${removing?.email ?? removing?.name ?? ""} from the group?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removing) return;
                update((current) => setMembership(current, group, { remove: removing }));
                saved(
                  removing.kind === "user"
                    ? `Successfully removed user ${removing.email ?? removing.name} from the group`
                    : `Successfully removed identity ${removing.name} from the group`
                );
                setRemoving(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
};

export const OrgGroupDetail = ({ id }: { id: string }) => {
  const { data, update, saved, toast, navigate } = useAccess();
  const can = useCan("org");
  const group = data.orgGroups.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const back = () => navigate({ orgTab: "groups" });
  if (!group)
    return (
      <EmptyState
        icon="user"
        title="Group not found"
        description="It may have been deleted in this preview."
        actions={
          <Button variant="outline" onClick={back}>
            Back to groups
          </Button>
        }
      />
    );
  const canEdit = can("groups", "edit");
  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <Stack gap={8}>
          <BackButton label="Organization groups" onClick={back} />
          <PageHeader
            title={group.name}
            description="Configure and manage organization group"
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
                  <DropdownMenuItem disabled={!canEdit} onSelect={() => setEditing(true)}>
                    <Icon icon={PencilIcon} />
                    Edit group
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!can("groups", "delete")}
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
              title="Details"
              description="Group details"
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
                  ["Organization role", group.role],
                  ["Created", group.createdAt]
                ]}
              />
            </Card>
          }
        >
          <div className={css.column}>
            <GroupMembersSection group={group} />
            <ProjectMembershipsSection
              subject="group"
              subjectId={group.id}
              subjectName={group.name}
              canEdit={canEdit}
            />
          </div>
        </DetailLayout>
      </Stack>
      {editing && <GroupDialog group={group} roleLabel="Role" open onOpenChange={setEditing} />}
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
              onClick={() => {
                update((current) => reapGroup(current, group.id));
                saved(`Successfully deleted the ${group.name} group`);
                back();
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
