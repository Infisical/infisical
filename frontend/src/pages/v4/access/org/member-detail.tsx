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
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Select } from "@infisical/cipher/ui/select";
import { useParams } from "@tanstack/react-router";
import { BanIcon, MailIcon, PencilIcon, UserCheckIcon } from "lucide-react";

import {
  OrgPermissionGroupActions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGroupWithProjectMemberships } from "@app/hooks/api/groups/types";
import type { OrgUser } from "@app/hooks/api/users/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDateTime, orgRoleName, orgRoleSlug, roleOptions } from "../roles";
import { failed, saved, toast } from "../toast";
import { Gate, ListToolbar, usePagedList, RESTRICTED } from "../ui";
import { BackButton, CopyButton, Dash, MetadataBadges, Value, VerifiedMark } from "./detail-parts";
import { type InviteLink, InviteUsersSheet } from "./invite-users-sheet";
import { type MetadataEntry, MetadataEditor, metadataErrors } from "./metadata-editor";
import { ProjectMembershipsSection } from "./project-memberships";
import { displayName, useIsSelf } from "./users";

import css from "./org.module.css";

const statusOf = (membership: OrgUser) => {
  if (!membership.isActive)
    return { label: "Deactivated", tone: "outline" as const, icon: BanIcon };
  return membership.status === "invited"
    ? { label: "Invited", tone: "info" as const, icon: MailIcon }
    : { label: "Active", tone: "ok" as const, icon: UserCheckIcon };
};

const EditMembershipDialog = ({
  membership,
  open,
  onOpenChange
}: {
  membership: OrgUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const update = access.useUpdateOrgMembership();
  const [role, setRole] = useState(orgRoleSlug(roles, membership));
  const [metadata, setMetadata] = useState<MetadataEntry[]>(
    membership.metadata.map(({ key, value }) => ({ key, value }))
  );
  const [errors, setErrors] = useState<{ key?: string; value?: string }[]>();
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Update membership</DialogTitle>
        </DialogHeader>
        <form
          id="update-org-membership"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = metadataErrors(metadata);
            setErrors(next);
            if (next.some((e) => e.key || e.value)) return;
            setPending(true);
            try {
              await update.mutateAsync({
                organizationId: orgId,
                membershipId: membership.id,
                role,
                metadata: metadata.map((m) => ({ key: m.key.trim(), value: m.value.trim() }))
              });
              saved("Successfully updated user organization role");
              onOpenChange(false);
            } catch (error) {
              failed("Failed to update user", error);
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={24}>
            <Field label="Update organization role">
              <Select
                label="Update organization role"
                placeholder="Select role..."
                value={role}
                options={roleOptions(roles)}
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
          <Button variant="primary" type="submit" form="update-org-membership" loading={pending}>
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const UserGroupsSection = ({ username }: { username: string }) => {
  const go = useGo();
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const canEdit = permission.can(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);
  const { data: groups = [], isPending } = access.useUserGroupMemberships(username);
  const removeUser = access.useRemoveUserFromGroup();
  const [removing, setRemoving] = useState<TGroupWithProjectMemberships>();
  const list = usePagedList({
    rows: groups,
    perPage: 10,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (group, needle) => group.name.toLowerCase().includes(needle),
    compare: (a, b) => a.name.localeCompare(b.name)
  });
  const columns: DataTableColumn<TGroupWithProjectMemberships>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      render: (group) => (
        <RowLink link={go.link(accessLinks.orgGroup(orgId, group.id))} title={group.name}>
          {group.name}
        </RowLink>
      )
    }
  ];

  const rowActions: DataTableRowActions<TGroupWithProjectMemberships> = {
    renderMenu: (group) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={() => setRemoving(group)}
      >
        <Icon name="trash" />
        Unassign from group
      </DropdownMenuItem>
    )
  };

  const hasRows = isPending || list.pageRows.length > 0;
  return (
    <>
      <Card
        variant="framed"
        title="Groups"
        flush={hasRows}
        action={
          <ListToolbar
            band
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search groups..."
          />
        }
      >
        {hasRows && (
          <DataTable
            label={`Groups for ${username}`}
            rows={list.pageRows}
            columns={columns}
            rowActions={rowActions}
            getRowId={(group) => group.id}
            rowLabel={(group) => group.name}
            loading={isPending}
            sort={list.sort}
            onSortChange={list.setSort}
            pagination={list.pagination}
          />
        )}
        {!hasRows &&
          (groups.length ? (
            <EmptyState size="sm" icon="search" title="No groups match this search" />
          ) : (
            <EmptyState
              size="sm"
              icon="user"
              title="This user has not been assigned to any groups"
              description="Add this user from a group's page."
            />
          ))}
      </Card>
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to unassign user from group?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose any access granted through this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!removing) return;
                try {
                  await removeUser.mutateAsync({
                    groupId: removing.id,
                    slug: removing.slug,
                    username
                  });
                  saved("User removed from group successfully");
                } catch (error) {
                  failed("Failed to remove user from group", error);
                }
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

export const OrgMemberDetail = () => {
  const { membershipId } = useParams({ from: "/v4/organizations/$orgId/members/$membershipId" });
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const isSelf = useIsSelf();
  const { permission } = useOrgPermission();
  const { data: membership, isPending } = access.useOrgMembership(orgId, membershipId);
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const update = access.useUpdateOrgMembership();
  const remove = access.useDeleteOrgMembership();
  const resendInvite = access.useResendOrgInvite();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [resending, setResending] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<readonly InviteLink[]>();
  const backHref = accessLinks.org(orgId, OrgAccessControlTabSections.Member);
  const back = () => go(backHref);
  if (isPending) return <Loader size="page" label="Loading user" />;
  if (!membership)
    return (
      <EmptyState
        icon="user"
        title="User not found"
        actions={
          <Button variant="outline" onClick={back}>
            Back to users
          </Button>
        }
      />
    );
  const { user } = membership;
  const self = isSelf(user);
  const name = displayName(user);
  const status = statusOf(membership);
  const canEdit = permission.can(OrgPermissionMemberActions.Edit, OrgPermissionSubjects.Member);
  const canCreate = permission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member);
  const email = user.email ?? membership.inviteEmail;

  const setActive = async (isActive: boolean) => {
    try {
      await update.mutateAsync({ organizationId: orgId, membershipId, isActive });
      saved(
        isActive
          ? "Successfully activated user in organization"
          : "Successfully deactivated user in organization"
      );
    } catch (error) {
      failed("Failed to update user", error);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const signupToken = await resendInvite.mutateAsync({ membershipId });
      if (signupToken) setInviteLinks([signupToken]);
      else saved("Successfully resent org invitation");
    } catch (error) {
      failed("Failed to resend org invitation", error);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <Stack gap={8}>
          <BackButton label="Organization users" onClick={back} />
          <PageHeader
            title={name ?? user.username}
            actions={
              !self && (
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
                    <DropdownMenuItem
                      disabled={!canEdit}
                      description={canEdit ? undefined : RESTRICTED}
                      onSelect={() => setEditing(true)}
                    >
                      <Icon icon={PencilIcon} />
                      Edit user
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      description={canEdit ? undefined : RESTRICTED}
                      onSelect={() =>
                        membership.isActive ? setDeactivating(true) : setActive(true)
                      }
                    >
                      <Icon name="user" />
                      {membership.isActive ? "Deactivate user" : "Activate user"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={
                        !permission.can(
                          OrgPermissionMemberActions.Delete,
                          OrgPermissionSubjects.Member
                        )
                      }
                      description={
                        permission.can(
                          OrgPermissionMemberActions.Delete,
                          OrgPermissionSubjects.Member
                        )
                          ? undefined
                          : RESTRICTED
                      }
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
              variant="framed"
              title="Details"
              action={
                !self && (
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
                  density="compact"
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
                      email ? (
                        <Value key="email">
                          {email}
                          <VerifiedMark verified={user.isEmailVerified} />
                          <CopyButton value={email} label="Copy user email to clipboard" />
                        </Value>
                      ) : (
                        <Dash key="email" />
                      )
                    ],
                    ...(user.username !== email ? [["Username", user.username] as const] : []),
                    ["Organization role", orgRoleName(roles, membership)],
                    [
                      "Status",
                      <Badge key="status" tone={status.tone}>
                        <Icon icon={status.icon} size={12} />
                        {status.label}
                      </Badge>
                    ],
                    ["Last login method", membership.lastLoginAuthMethod ?? <Dash key="method" />],
                    [
                      "Last logged in",
                      membership.lastLoginTime ? (
                        formatDateTime(membership.lastLoginTime)
                      ) : (
                        <Dash key="time" />
                      )
                    ],
                    ["Metadata", <MetadataBadges key="metadata" items={membership.metadata} />]
                  ]}
                />
                {membership.isActive &&
                  (membership.status === "invited" || membership.status === "verified") && (
                    <Gate allowed={canCreate}>
                      <Button
                        variant="primary"
                        loading={resending}
                        disabled={!canCreate}
                        onClick={resend}
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
              subjectId={membership.id}
              subjectName={user.username}
              username={user.username}
              canEdit={canEdit}
              canAdd={!self}
            />
            <UserGroupsSection username={user.username} />
          </div>
        </DetailLayout>
      </Stack>
      {editing && <EditMembershipDialog membership={membership} open onOpenChange={setEditing} />}
      <InviteUsersSheet
        open={Boolean(inviteLinks)}
        links={inviteLinks}
        onOpenChange={(open) => !open && setInviteLinks(undefined)}
      />
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove member with username ${user.username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>They lose access to the organization.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync({ orgId, membershipId });
                  saved("Successfully removed user from org");
                  back();
                } catch (error) {
                  failed("Failed to remove user from org", error);
                  setRemoving(false);
                }
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
            <AlertDialogDescription>They lose access until reactivated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await setActive(false);
                setDeactivating(false);
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
