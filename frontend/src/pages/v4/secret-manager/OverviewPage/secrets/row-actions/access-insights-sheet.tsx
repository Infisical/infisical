import { useState } from "react";
import { BanIcon, FilterIcon, HardDriveIcon, UserPlusIcon, UsersIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Switch } from "@app/components/v4/ui/switch";
import {
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";

import { useV4Adapter } from "../../../../data/adapters";
import type { TSecretAccessList } from "../../../../data/secrets/contract-flows";
import type { Secret } from "../../secrets-model";
import { Gate } from "../flows/shared";
import { NEXT_PHASE, type RowActionProps } from "../overview-cells";

import styles from "./row-actions.module.css";

type RowType = "user" | "identity" | "group";
type Action = "describe" | "read" | "create" | "edit" | "delete";
type AccessRow = {
  id: string;
  type: RowType;
  name: string;
  actions: Action[];
  inherited?: Action[];
  groups?: string[];
};

const columns: { action: Action; label: string }[] = [
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
  const has = (...actions: ProjectPermissionSecretActions[]) =>
    actions.some((action) => allowed.includes(action));
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
      const groups = groupsOf(entry.id, key);
      const inherited = [
        ...new Set(groups.flatMap((group) => actionsOf(group.allowedActions)))
      ].filter((action) => !actions.includes(action));
      return {
        id: `${type}-${entry.id}`,
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
      type: "group" as const,
      name: group.name,
      actions: actionsOf(group.allowedActions)
    }))
  ];
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
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<RowType[]>([]);
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
      (!types.length || types.includes(row.type)) &&
      row.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const loading = open && isPending;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={styles.accessSheet}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Secret access insights</SheetTitle>
          <SheetDescription>
            Users, groups, and identities that can access this secret.
          </SheetDescription>
        </SheetHeader>
        <SheetSubheader className={styles.subject}>
          <span className={styles.subjectName}>{secret.name}</span>
          <Badge tone="outline">{environmentLabel}</Badge>
        </SheetSubheader>
        <SheetBody>
          <div className={styles.accessBody}>
            <div className={styles.accessToolbar}>
              <span className={styles.toggleLabel}>
                <Switch id="access-show-all" checked={showAll} onCheckedChange={setShowAll} />
                <FieldLabel htmlFor="access-show-all">Show all members</FieldLabel>
                <Tooltip content="When enabled, all project members are shown including those without any access to this secret.">
                  <span className={styles.hint}>
                    <Icon name="info" size={14} label="About showing all members" />
                  </span>
                </Tooltip>
              </span>
              <Input
                icon="search"
                className={styles.grow}
                aria-label="Search by name"
                placeholder="Search by name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <DropdownMenu>
                <Tooltip content="Filter by type">
                  <DropdownMenuTrigger asChild>
                    <Button variant={types.length ? "default" : "outline"} size="icon-sm" iconOnly>
                      <Icon icon={FilterIcon} />
                      <span className="sr-only">Filter by type</span>
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end">
                  {typeOrder.map((type) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={types.includes(type)}
                      onCheckedChange={() =>
                        setTypes((current) =>
                          current.includes(type)
                            ? current.filter((entry) => entry !== type)
                            : [...current, type]
                        )
                      }
                    >
                      <Icon name={typeConfig[type].name} icon={typeConfig[type].icon} />
                      {typeConfig[type].label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Gate reason={NEXT_PHASE}>
                <Button disabled>
                  <Icon icon={UserPlusIcon} />
                  Grant organization user access
                </Button>
              </Gate>
            </div>
            {loading && (
              <span role="status" className="sr-only">
                Loading access
              </span>
            )}
            {!loading && rows.length === 0 && <EmptyState icon="search" title="No results found" />}
            {(loading || rows.length > 0) && (
              <Table aria-busy={loading || undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={styles.typeColumn}>Type</TableHead>
                    <TableHead>Name</TableHead>
                    {columns.map((column) => (
                      <TableHead key={column.action} className={styles.permissionColumn}>
                        {column.label}
                      </TableHead>
                    ))}
                    <TableActionsHead slots={1} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading &&
                    [0, 1, 2, 3].map((index) => (
                      <TableRow key={index} aria-hidden>
                        <TableCell>
                          <Skeleton width={96} />
                        </TableCell>
                        <TableCell>
                          <Skeleton width={160} />
                        </TableCell>
                        {columns.map((column) => (
                          <TableCell key={column.action} className={styles.permissionColumn}>
                            <Skeleton width="var(--v4-size-glyph)" height="var(--v4-size-glyph)" />
                          </TableCell>
                        ))}
                        <TableActionsCell slots={1} />
                      </TableRow>
                    ))}
                  {rows.map((row) => {
                    const rowActions: RowActionProps = {
                      label: row.name,
                      menu: (
                        <>
                          {row.type !== "group" && (
                            <DropdownMenuItem disabled description={NEXT_PHASE}>
                              <Icon name="plus" />
                              Add additional privilege
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem disabled description={NEXT_PHASE}>
                            <Icon name="external" />
                            Manage access
                          </DropdownMenuItem>
                        </>
                      )
                    };
                    return (
                      <RowContextMenu key={row.id} {...rowActions}>
                        <TableRow>
                          <TableCell>
                            <span className={styles.typeCell}>
                              <Icon
                                name={typeConfig[row.type].name}
                                icon={typeConfig[row.type].icon}
                              />
                              {typeConfig[row.type].label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={styles.typeCell}>
                              <span className={styles.truncate}>{row.name}</span>
                              {row.groups && (
                                <Tooltip content={`Access through group: ${row.groups.join(", ")}`}>
                                  <span className={styles.groupCount}>
                                    <Icon icon={UsersIcon} size={12} />
                                    {row.groups.length}
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </TableCell>
                          {columns.map((column) => {
                            let mark = (
                              <span className={styles.permissionNone}>
                                <Icon icon={BanIcon} label="No access" />
                              </span>
                            );
                            if (row.inherited?.includes(column.action))
                              mark = (
                                <Tooltip content="Inherited from group">
                                  <span className={styles.permissionYes}>
                                    <Icon icon={UsersIcon} label="Inherited from group" />
                                  </span>
                                </Tooltip>
                              );
                            if (row.actions.includes(column.action))
                              mark = (
                                <span className={styles.permissionYes}>
                                  <Icon name="check" label="Allowed" />
                                </span>
                              );
                            return (
                              <TableCell key={column.action} className={styles.permissionColumn}>
                                {mark}
                              </TableCell>
                            );
                          })}
                          <TableActionsCell slots={1}>
                            <RowActions {...rowActions} />
                          </TableActionsCell>
                        </TableRow>
                      </RowContextMenu>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
