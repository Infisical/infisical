import { useState } from "react";
import { BanIcon, MailIcon, PencilIcon, UserCheckIcon } from "lucide-react";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@app/components/v4/ui/input";
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";

import { useAccess } from "../context";
import { displayName, type GroupRef, type OrgMember, roleName, SELF_USER_ID } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan, usePagedList } from "../ui";
import { roleOptions } from "./create-identity-sheet";
import {
  BackButton,
  CopyButton,
  Dash,
  MetadataBadges,
  Section,
  Value,
  VerifiedMark
} from "./detail-parts";
import { type MetadataEntry, MetadataEditor, metadataErrors } from "./metadata-editor";
import { ProjectMembershipsSection } from "./project-memberships";

import css from "./org.module.css";

type Membership = NonNullable<OrgMember["membership"]>;

const statusOf = (membership: Membership) => {
  if (!membership.isActive)
    return { label: "Deactivated", tone: "outline" as const, icon: BanIcon };
  return membership.status === "invited"
    ? { label: "Invited", tone: "info" as const, icon: MailIcon }
    : { label: "Active", tone: "ok" as const, icon: UserCheckIcon };
};

const EditMembershipDialog = ({
  member,
  open,
  onOpenChange
}: {
  member: OrgMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved } = useAccess();
  const membership = member.membership!;
  const [role, setRole] = useState(membership.role);
  const [metadata, setMetadata] = useState<MetadataEntry[]>(membership.metadata ?? []);
  const [errors, setErrors] = useState<{ key?: string; value?: string }[]>();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update membership</DialogTitle>
        </DialogHeader>
        <form
          id="update-org-membership"
          onSubmit={(event) => {
            event.preventDefault();
            const next = metadataErrors(metadata);
            setErrors(next);
            if (next.some((e) => e.key || e.value)) return;
            update((current) => ({
              ...current,
              orgMembers: current.orgMembers.map((item) =>
                item.membership?.id === membership.id
                  ? {
                      ...item,
                      membership: {
                        ...item.membership,
                        role,
                        metadata: metadata.map((m) => ({
                          key: m.key.trim(),
                          value: m.value.trim()
                        }))
                      }
                    }
                  : item
              )
            }));
            saved("Successfully updated user organization role");
            onOpenChange(false);
          }}
        >
          <Stack gap={24}>
            <Field label="Update organization role">
              <Select
                label="Update organization role"
                placeholder="Select role..."
                value={role}
                options={roleOptions(data.orgRoles)}
                onChange={setRole}
              />
            </Field>
            <MetadataEditor
              addLabel="Add key"
              entries={metadata}
              errors={errors}
              onChange={setMetadata}
            />
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="update-org-membership">
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const UserGroupsSection = ({ member }: { member: OrgMember }) => {
  const { update, saved } = useAccess();
  const can = useCan("org");
  const [removing, setRemoving] = useState<GroupRef>();
  const list = usePagedList({
    rows: member.groups,
    perPage: 10,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (group, needle) => group.name.toLowerCase().includes(needle),
    compare: (a, b) => a.name.localeCompare(b.name)
  });
  const columns: AccessColumn<GroupRef>[] = [
    { id: "name", header: "Name", sortable: true, render: (group) => <span>{group.name}</span> },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (group) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${group.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("groups", "edit")}
              onSelect={() => setRemoving(group)}
            >
              <Icon name="trash" />
              Unassign from group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <Section title="Groups" description="Manage user group memberships">
      <Input
        icon="search"
        placeholder="Search groups..."
        aria-label="Search groups"
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
      />
      <AccessTable
        label={`Groups for ${member.user.username}`}
        rows={list.pageRows}
        columns={columns}
        getRowId={(group) => group.id}
        rowLabel={(group) => group.name}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          member.groups.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No groups match this search"
              description="Adjust search filters to view group memberships."
            />
          ) : (
            <EmptyState
              size="sm"
              icon="user"
              title="This user has not been assigned to any groups"
              description="Assign this user to a group from the group access control page."
            />
          )
        }
      />
      {list.pagination}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to unassign user from group?</AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removing) return;
                update((current) => ({
                  ...current,
                  orgMembers: current.orgMembers.map((item) =>
                    item.user.id === member.user.id
                      ? { ...item, groups: item.groups.filter((g) => g.id !== removing.id) }
                      : item
                  ),
                  orgGroups: current.orgGroups.map((group) =>
                    group.id === removing.id
                      ? {
                          ...group,
                          memberIds: group.memberIds.filter((id) => id !== member.user.id)
                        }
                      : group
                  )
                }));
                saved("User removed from group successfully");
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

export const OrgMemberDetail = ({ id }: { id: string }) => {
  const { data, update, saved, toast, navigate } = useAccess();
  const can = useCan("org");
  const member = data.orgMembers.find((item) => item.membership?.id === id);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [resending, setResending] = useState(false);
  const back = () => navigate({ orgTab: "members" });
  if (!member?.membership)
    return (
      <EmptyState
        icon="user"
        title="User not found"
        description="This user may have been removed in this preview."
        actions={
          <Button variant="outline" onClick={back}>
            Back to users
          </Button>
        }
      />
    );
  const { membership, user } = member;
  const isSelf = user.id === SELF_USER_ID;
  const name = displayName(user);
  const status = statusOf(membership);
  const canEdit = can("member", "edit");
  const setMembership = (patch: Partial<Membership>) =>
    update((current) => ({
      ...current,
      orgMembers: current.orgMembers.map((item) =>
        item.membership?.id === membership.id
          ? { ...item, membership: { ...item.membership, ...patch } }
          : item
      )
    }));

  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <Stack gap={8}>
          <BackButton label="Organization users" onClick={back} />
          <PageHeader
            title={name ?? user.username}
            description="Configure and manage organization user membership"
            actions={
              !isSelf && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" iconRight="more">
                      Options
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        navigator.clipboard?.writeText(user.id);
                        toast({ tone: "neutral", title: "User ID copied to clipboard" });
                      }}
                    >
                      <Icon name="copy" />
                      Copy user ID
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canEdit} onSelect={() => setEditing(true)}>
                      <Icon icon={PencilIcon} />
                      Edit user
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      onSelect={() =>
                        membership.isActive
                          ? setDeactivating(true)
                          : setMembership({ isActive: true })
                      }
                    >
                      <Icon name="user" />
                      {membership.isActive ? "Deactivate user" : "Activate user"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!can("member", "delete")}
                      onSelect={() => setRemoving(true)}
                    >
                      <Icon name="trash" />
                      Remove user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          />
        </Stack>
        <DetailLayout
          asideLabel="Details"
          aside={
            <Card
              title="Details"
              description="User membership details"
              action={
                !isSelf && (
                  <Gate allowed={canEdit}>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      aria-label="Edit user"
                      disabled={!canEdit}
                      onClick={() => setEditing(true)}
                    >
                      <Icon icon={PencilIcon} size={12} />
                    </Button>
                  </Gate>
                )
              }
            >
              <Stack gap={16}>
                <DataList
                  variant="props"
                  items={[
                    ["Name", name ?? <Dash key="name" />],
                    [
                      "ID",
                      <Value key="id" mono>
                        {user.id}
                        <CopyButton value={user.id} label="Copy user ID to clipboard" />
                      </Value>
                    ],
                    [
                      "Email",
                      <Value key="email">
                        {user.email}
                        <VerifiedMark verified={membership.status !== "invited"} />
                        <CopyButton value={user.email} label="Copy user email to clipboard" />
                      </Value>
                    ],
                    ...(user.username !== user.email ? [["Username", user.username] as const] : []),
                    ["Organization role", roleName(data.orgRoles, membership.role)],
                    [
                      "Status",
                      <Badge key="status" tone={status.tone}>
                        <Icon icon={status.icon} size={12} />
                        {status.label}
                      </Badge>
                    ],
                    ["Last login method", membership.lastLogin?.method ?? <Dash key="method" />],
                    ["Last logged in", membership.lastLogin?.time ?? <Dash key="time" />],
                    ["Metadata", <MetadataBadges key="metadata" items={membership.metadata} />]
                  ]}
                />
                {membership.isActive &&
                  (membership.status === "invited" || membership.status === "verified") && (
                    <Gate allowed={can("member", "create")}>
                      <Button
                        variant="primary"
                        loading={resending}
                        disabled={!can("member", "create")}
                        onClick={() => {
                          setResending(true);
                          window.setTimeout(() => {
                            setResending(false);
                            toast({
                              tone: "ok",
                              title: "Successfully resent org invitation",
                              description: "Local demo only. No email was sent."
                            });
                          }, 600);
                        }}
                      >
                        Resend invite
                      </Button>
                    </Gate>
                  )}
              </Stack>
            </Card>
          }
        >
          <div className={css.column}>
            <ProjectMembershipsSection
              subject="user"
              subjectId={user.id}
              subjectName={user.username}
              canEdit={canEdit}
              canAdd={!isSelf}
            />
            <UserGroupsSection member={member} />
          </div>
        </DetailLayout>
      </Stack>
      {editing && <EditMembershipDialog member={member} open onOpenChange={setEditing} />}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove member with username ${user.username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                update((current) => ({
                  ...current,
                  orgMembers: current.orgMembers.filter(
                    (item) => item.membership?.id !== membership.id
                  )
                }));
                saved("Successfully removed user from org");
                back();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deactivating} onOpenChange={setDeactivating}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to deactivate member with username ${user.username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setMembership({ isActive: false });
                setDeactivating(false);
                saved("Successfully deactivated user in organization");
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
