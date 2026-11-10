import { useMemo, useState } from "react";
import { MailIcon, UserMinusIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { OrgMembershipRole } from "@app/helpers/roles";
import type { OrganizationWithProjects } from "@app/hooks/api/admin/types";
import { OrgMembershipStatus } from "@app/hooks/api/organization/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ConfirmDialog, fullName, Muted } from "./shared";

type Member = OrganizationWithProjects["members"][number];

const PAGE_SIZE = 15;

const roleLabel = (role: string) =>
  role.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const emailOf = (member: Member) => member.user.username || member.user.email || "";

const canResend = (member: Member) =>
  member.role === OrgMembershipRole.Admin && member.status !== OrgMembershipStatus.Accepted;

export const OrganizationMembersSheet = ({
  organization,
  onOpenChange
}: {
  organization?: OrganizationWithProjects;
  onOpenChange: (open: boolean) => void;
}) => {
  const admin = useV4Adapter("admin");
  const resendInvite = admin.useResendOrgInvite();
  const deleteMembership = admin.useDeleteOrganizationMembership();
  const deleteUser = admin.useDeleteUser();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "name",
    direction: "asc"
  });
  const [removing, setRemoving] = useState<Member>();
  const [deleting, setDeleting] = useState<Member>();
  const members = organization?.members ?? [];

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    const value = (member: Member) =>
      sort.columnId === "email"
        ? member.user.email || member.user.username
        : (member.user.firstName ?? member.user.lastName);
    return members
      .filter(({ user }) =>
        [user.firstName, user.lastName, user.username, user.email].some((field) =>
          field?.toLowerCase().includes(needle)
        )
      )
      .sort((a, b) => {
        const [first, second] = [value(a), value(b)];
        if (!first) return 1;
        if (!second) return -1;
        const order = first.toLowerCase().localeCompare(second.toLowerCase());
        return sort.direction === "asc" ? order : -order;
      });
  }, [members, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  const resend = async (member: Member) => {
    if (!organization) return;
    try {
      await resendInvite.mutateAsync({
        membershipId: member.membershipId,
        organizationId: organization.id
      });
      saved("Successfully resent org invitation");
    } catch {
      // Reported by the mutation cache.
    }
  };

  const columns: DataTableColumn<Member>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (member) => fullName(member.user) ?? "",
      render: (member) => fullName(member.user) ?? <Muted>Not set</Muted>
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      grow: true,
      render: emailOf
    },
    {
      id: "role",
      header: "Role",
      width: 200,
      render: (member) => (
        <Inline gap={8} align="center" wrap={false}>
          {member.roleId ? (
            <Tooltip content="This member has a custom role assigned.">
              <Badge tone="soft">
                {roleLabel(member.role)}
                <Icon name="info" size={12} />
              </Badge>
            </Tooltip>
          ) : (
            <Badge tone="soft">{roleLabel(member.role)}</Badge>
          )}
          {member.status !== OrgMembershipStatus.Accepted && <Badge tone="warn">Invited</Badge>}
        </Inline>
      )
    }
  ];

  const rowActions: DataTableRowActions<Member> = {
    menuLabel: "Member options",
    renderMenu: (member) => (
      <>
        <DropdownMenuItem
          disabled={!canResend(member) || resendInvite.isPending}
          description={canResend(member) ? undefined : "Only pending admin invites can be resent"}
          onSelect={() => resend(member)}
        >
          <Icon icon={MailIcon} />
          Resend invite
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
          <Icon icon={UserMinusIcon} />
          Remove from organization
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(member)}>
          <Icon name="trash" />
          Delete user
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <Sheet
      open={Boolean(organization)}
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          setPage(1);
        }
        onOpenChange(open);
      }}
    >
      <SheetContent size="lg" onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>{organization ? `${organization.name} members` : "Members"}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <Input
              icon="search"
              aria-label="Search members"
              placeholder="Search members..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <DataTable
              label={`Members of ${organization?.name ?? "organization"}`}
              rows={filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)}
              columns={columns}
              getRowId={(member) => member.membershipId}
              rowLabel={emailOf}
              rowActions={rowActions}
              sort={sort}
              onSortChange={setSort}
              empty={
                <EmptyState
                  size="sm"
                  icon={members.length ? "search" : "user"}
                  title={
                    members.length
                      ? "No organization users match search"
                      : "No organization users found"
                  }
                />
              }
              pagination={
                filtered.length > 0 ? (
                  <Pagination
                    label="Member pages"
                    variant="compact"
                    page={current}
                    onPageChange={setPage}
                    total={filtered.length}
                    pageSize={PAGE_SIZE}
                  />
                ) : undefined
              }
            />
          </Stack>
        </SheetBody>
      </SheetContent>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove ${removing ? emailOf(removing) : ""} from ${organization?.name ?? ""}?`}
        description="The user will lose access to this organization. You can add them again later."
        confirmText="delete"
        actionLabel="Remove"
        onConfirm={async () => {
          if (!organization || !removing) return;
          await deleteMembership.mutateAsync({
            organizationId: organization.id,
            membershipId: removing.membershipId
          });
          saved("Successfully removed user from organization");
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete user ${deleting ? emailOf(deleting) : ""}?`}
        confirmText="delete"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteUser.mutateAsync(deleting.user.id);
          saved("Successfully deleted user");
        }}
      />
    </Sheet>
  );
};
