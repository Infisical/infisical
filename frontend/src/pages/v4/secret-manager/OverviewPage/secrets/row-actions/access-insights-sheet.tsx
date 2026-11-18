import { useState } from "react";
import { subject } from "@casl/ability";
import { useIsMobile } from "@infisical/cipher/hooks/use-mobile";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { HardDriveIcon, UsersIcon } from "lucide-react";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { accessLinks } from "../../../../access/links";
import { useOrgPermission, useProjectPermission } from "../../../../access/permissions";
import { useProjectScope } from "../../../../access/project/scope";
import { useV4Adapter } from "../../../../data/adapters";
import type { TSecretAccessList } from "../../../../data/secrets/contract-flows";
import { useV4Session } from "../../../../data/session/contract";
import { useGo } from "../../../../links";
import type { Secret } from "../../secrets-model";
import { GrantAccessDialog } from "./access-grant-dialog";
import { AdditionalPrivilegeSheet, type PrivilegeTarget } from "./access-privilege-sheet";

import styles from "./row-actions.module.css";

type RowType = "user" | "identity" | "group";
type Action = "describe" | "read" | "create" | "edit" | "delete";
type AccessRow = {
  id: string;
  entityId: string;
  membershipId: string;
  type: RowType;
  name: string;
  actions: Action[];
  inherited?: Action[];
  groups?: string[];
};

const permissionColumns: { action: Action; label: string }[] = [
  { action: "describe", label: "Describe" },
  { action: "read", label: "Read Value" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Edit" },
  { action: "delete", label: "Delete" }
];
const typeConfig: Record<RowType, { label: string; icon?: typeof UsersIcon; name?: "user" }> = {
  user: { label: "User", name: "user" },
  identity: { label: "Machine Identity", icon: HardDriveIcon },
  group: { label: "Group", icon: UsersIcon }
};
const typeOrder: RowType[] = ["user", "identity", "group"];

const actionsOf = (allowed: ProjectPermissionSecretActions[]): Action[] => {
  const allowedSet = new Set(allowed);
  const has = (...actions: ProjectPermissionSecretActions[]) =>
    actions.some((action) => allowedSet.has(action));
  const actions: Action[] = [];
  if (
    has(
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue
    )
  )
    actions.push("describe");
  if (
    has(
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.DescribeAndReadValue
    )
  )
    actions.push("read");
  if (has(ProjectPermissionSecretActions.Create)) actions.push("create");
  if (has(ProjectPermissionSecretActions.Edit)) actions.push("edit");
  if (has(ProjectPermissionSecretActions.Delete)) actions.push("delete");
  return actions;
};

const toRows = (list?: TSecretAccessList): AccessRow[] => {
  if (!list) return [];
  const groupsOf = (id: string, key: "userIds" | "identityIds") =>
    list.groups.filter((group) => group[key].includes(id));
  const member =
    (type: "user" | "identity", key: "userIds" | "identityIds") =>
    (entry: TSecretAccessList["users"][number]): AccessRow => {
      const actions = actionsOf(entry.allowedActions);
      const direct = new Set(actions);
      const groups = groupsOf(entry.id, key);
      const inherited = [
        ...new Set(groups.flatMap((group) => actionsOf(group.allowedActions)))
      ].filter((action) => !direct.has(action));
      return {
        id: `${type}-${entry.id}`,
        entityId: entry.id,
        membershipId: entry.membershipId,
        type,
        name: entry.name,
        actions,
        inherited: inherited.length ? inherited : undefined,
        groups: groups.length ? groups.map((group) => group.name) : undefined
      };
    };
  return [
    ...list.users.map(member("user", "userIds")),
    ...list.identities.map(member("identity", "identityIds")),
    ...list.groups.map((group) => ({
      id: `group-${group.id}`,
      entityId: group.id,
      membershipId: group.membershipId,
      type: "group" as const,
      name: group.name,
      actions: actionsOf(group.allowedActions)
    }))
  ];
};

const useAccessRowControls = (secret: Secret) => {
  const go = useGo();
  const scope = useProjectScope();
  const session = useV4Session();
  const { permission } = useProjectPermission(secret.project);
  const { permission: orgPermission } = useOrgPermission();
  const project = useV4Adapter("secrets").useProject(secret.project);
  const privilegesEnabled = Boolean(project.data?.isLegacyAdditionalPrivilegesEnabled);
  const isSelf = (row: AccessRow) => row.type === "user" && row.entityId === session.user.id;
  const privilegeBlock = (row: AccessRow) => {
    if (!privilegesEnabled) return "Additional privileges are turned off for this project";
    if (isSelf(row)) return "You cannot modify your own privileges";
    const allowed =
      row.type === "user"
        ? permission.can(
            ProjectPermissionMemberActions.AssignAdditionalPrivileges,
            subject(ProjectPermissionSub.Member, { userEmail: row.name })
          )
        : permission.can(
            ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
            subject(ProjectPermissionSub.Identity, { identityId: row.entityId })
          );
    return allowed ? undefined : "You do not have permission to perform this action";
  };
  const manageHref = (row: AccessRow) => {
    if (row.type === "user") return accessLinks.projectMember(scope, row.membershipId);
    if (row.type === "identity") return accessLinks.projectIdentity(scope, row.entityId);
    return accessLinks.projectGroup(scope, row.entityId);
  };
  const menu = (row: AccessRow, onAddPrivilege: (target: PrivilegeTarget) => void) => (
    <>
      {row.type !== "group" && (
        <DropdownMenuItem
          disabledReason={privilegeBlock(row)}
          onSelect={() =>
            onAddPrivilege({
              type: row.type === "user" ? "user" : "identity",
              membershipId: row.membershipId,
              identityId: row.entityId,
              name: row.name
            })
          }
        >
          <Icon name="plus" />
          Add additional privilege
        </DropdownMenuItem>
      )}
      <DropdownMenuItem asChild>
        <Link {...go.link(manageHref(row))} target="_blank">
          <Icon name="external" />
          {isSelf(row) ? "View access" : "Manage access"}
        </Link>
      </DropdownMenuItem>
    </>
  );
  const canGrantAccess =
    orgPermission.can(OrgPermissionMemberActions.Read, OrgPermissionSubjects.Member) &&
    permission.can(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member) &&
    permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      ProjectPermissionSub.Member
    ) &&
    permission.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);
  let grantBlock: string | undefined;
  if (!canGrantAccess)
    grantBlock =
      "You do not have permission to add members to this project and manage their permissions";
  else if (!privilegesEnabled) grantBlock = "Additional privileges are turned off for this project";
  return {
    grantBlock,
    canAddParentOrgUsers:
      session.organization.isSubOrganization &&
      orgPermission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member),
    menu
  };
};

export function AccessInsightsSheet({
  open,
  secret,
  environmentLabel,
  onOpenChange
}: {
  open: boolean;
  secret: Secret;
  environmentLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [granting, setGranting] = useState(false);
  const [privilegeTarget, setPrivilegeTarget] = useState<PrivilegeTarget>();
  const isMobile = useIsMobile();
  const { grantBlock, canAddParentOrgUsers, menu } = useAccessRowControls(secret);
  const showAll = filters.some(
    (filter) => filter.field === "members" && filter.values[0] === "all"
  );
  const types = new Set(filters.find((filter) => filter.field === "type")?.values);
  const { data: accessList, isPending } = useV4Adapter("secrets").useSecretAccessList({
    projectId: secret.project,
    environment: secret.environment,
    secretPath: secret.path,
    secretKey: open ? secret.name : "",
    includeAllEntities: showAll
  });
  const rows = toRows(accessList).filter(
    (row) =>
      (showAll || row.actions.length > 0 || Boolean(row.inherited?.length)) &&
      (!types.size || types.has(row.type)) &&
      row.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const filtered = Boolean(search.trim()) || types.size > 0;
  let empty = (
    <EmptyState
      icon={UsersIcon}
      title="No one has access to this secret"
      actions={
        <Button
          variant="outline"
          onClick={() =>
            setFilters([
              ...filters.filter((filter) => filter.field !== "members"),
              { field: "members", values: ["all"] }
            ])
          }
        >
          Show all members
        </Button>
      }
    />
  );
  if (showAll) empty = <EmptyState icon={UsersIcon} title="This project has no members" />;
  if (filtered) empty = <EmptyState icon="search" title="No matching members" />;
  const columns: DataTableColumn<AccessRow>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (row) => row.name,
      render: (row) => (
        <span className={styles.member}>
          <span className={styles.memberIcon}>
            <Icon
              name={typeConfig[row.type].name}
              icon={typeConfig[row.type].icon}
              label={typeConfig[row.type].label}
            />
          </span>
          <span className={styles.truncate} title={row.name}>
            {row.name}
          </span>
          {row.groups && !isMobile && (
            <Tooltip content={`Access through group: ${row.groups.join(", ")}`}>
              <span className={styles.groupCount} data-row-interactive>
                <Icon icon={UsersIcon} size={12} />
                {row.groups.length}
              </span>
            </Tooltip>
          )}
        </span>
      )
    },
    ...permissionColumns.map((column): DataTableColumn<AccessRow> => ({
      id: column.action,
      header: column.label,
      width: 96,
      align: "center",
      render: (row) => {
        if (row.actions.includes(column.action))
          return (
            <span className={styles.permissionYes}>
              <Icon name="check" label="Allowed" />
            </span>
          );
        if (row.inherited?.includes(column.action))
          return (
            <Tooltip content="Inherited from group">
              <span className={styles.permissionYes} data-row-interactive>
                <Icon icon={UsersIcon} label="Inherited from group" />
              </span>
            </Tooltip>
          );
        return (
          <span className={styles.permissionNone}>
            <Icon name="minus" label="No access" />
          </span>
        );
      }
    }))
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="xl" onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Secret access insights</SheetTitle>
          <SheetDescription className={styles.subjectLine}>
            <span className={styles.subjectName} data-mono>
              {secret.name}
            </span>
            <Badge tone="outline">{environmentLabel}</Badge>
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <FilterBar
              label="Access filters"
              searchLabel="Search by name"
              searchPlaceholder={isMobile ? "Search..." : "Search by name..."}
              searchValue={search}
              onSearchChange={setSearch}
              slashShortcut={false}
              fields={[
                {
                  key: "type",
                  label: "Type",
                  type: "multi-select",
                  options: typeOrder.map((type) => ({ value: type, label: typeConfig[type].label }))
                },
                {
                  key: "members",
                  label: "Members",
                  type: "select",
                  options: [
                    { value: "access", label: "With access" },
                    { value: "all", label: "All members" }
                  ]
                }
              ]}
              value={filters}
              onChange={setFilters}
              actions={
                <Button
                  icon={isMobile ? "user-plus" : undefined}
                  iconOnly={isMobile}
                  disabledReason={grantBlock}
                  onClick={() => setGranting(true)}
                >
                  Grant access
                </Button>
              }
            />
            <DataTable
              label={`Access to ${secret.name}`}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.name}
              loading={open && isPending}
              loadingRows={4}
              rowActions={{ renderMenu: (row) => menu(row, setPrivilegeTarget) }}
              empty={empty}
              filtered={filtered}
              ghost={false}
            />
          </Stack>
        </SheetBody>
      </SheetContent>
      {granting && (
        <GrantAccessDialog
          secret={secret}
          canAddParentOrgUsers={canAddParentOrgUsers}
          onClose={() => setGranting(false)}
        />
      )}
      {privilegeTarget && (
        <AdditionalPrivilegeSheet
          key={privilegeTarget.membershipId}
          secret={secret}
          target={privilegeTarget}
          onClose={() => setPrivilegeTarget(undefined)}
        />
      )}
    </Sheet>
  );
}
