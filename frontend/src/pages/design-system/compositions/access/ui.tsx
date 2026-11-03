import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import { ClockAlertIcon, ClockIcon, FilterIcon, InfoIcon } from "lucide-react";

import { Badge, Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { type Action, type Subject, useAccess } from "./context";
import { isExpired, type ProjectRoleGrant, type Role, roleName, type Scope } from "./model";

import styles from "./access.module.css";

export type Sort = { columnId: string; direction: "asc" | "desc" };

export const RESTRICTED = "Access restricted";

export const Gate = ({
  allowed,
  reason = RESTRICTED,
  children
}: {
  allowed: boolean;
  reason?: string;
  children: ReactElement;
}) =>
  allowed ? (
    children
  ) : (
    <Tooltip content={reason}>
      <span className={styles.blockedCheck}>{children}</span>
    </Tooltip>
  );

export const useCan = (scope: Scope) => {
  const { can } = useAccess();
  return (subject: Subject, action: Action) => can(scope, subject, action);
};

export const AccessRestricted = ({ requirement }: { requirement?: string }) => (
  <EmptyState
    icon="lock"
    title="You're one permission away."
    description={`Your role doesn't include the permission this page requires. An admin can grant it.${requirement ? ` Missing: ${requirement}.` : ""}`}
    actions={<Button variant="outline">Back to home</Button>}
  />
);

export const ListToolbar = ({
  search,
  onSearch,
  placeholder,
  filter
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  filter?: {
    label: string;
    options: readonly { value: string; label: string }[];
    selected: readonly string[];
    onToggle: (value: string) => void;
    disabled?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  };
}) => (
  <div className={styles.toolbar}>
    <div className={styles.grow}>
      <Input
        icon="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
    </div>
    {filter && (
      <DropdownMenu open={filter.open} onOpenChange={filter.onOpenChange}>
        <Tooltip content={filter.label}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label={filter.label} disabled={filter.disabled}>
              <Icon icon={FilterIcon} />
              {filter.selected.length > 0 && <Count tone="ink">{filter.selected.length}</Count>}
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
          {filter.options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filter.selected.includes(option.value)}
              onSelect={(event) => {
                event.preventDefault();
                filter.onToggle(option.value);
              }}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
);

export const usePagedList = <Row,>({
  rows,
  matches,
  compare,
  initialSort,
  initialSearch = "",
  perPage: initialPerPage = 20
}: {
  rows: readonly Row[];
  matches: (row: Row, needle: string) => boolean;
  compare: (a: Row, b: Row, columnId: string) => number;
  initialSort: Sort;
  initialSearch?: string;
  perPage?: number;
}) => {
  const [search, setSearchValue] = useState(initialSearch);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => matches(row, needle))
      .sort((a, b) => compare(a, b, sort.columnId) * (sort.direction === "asc" ? 1 : -1));
  }, [rows, search, sort, matches, compare]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pageCount);
  return {
    search,
    setSearch: (value: string) => {
      setSearchValue(value);
      setPage(1);
    },
    sort,
    setSort,
    filtered,
    pageRows: filtered.slice((current - 1) * perPage, current * perPage),
    resetPage: () => setPage(1),
    pagination:
      filtered.length > 0 ? (
        <Pagination
          page={current}
          total={filtered.length}
          pageSize={perPage}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPerPage(size);
            setPage(1);
          }}
        />
      ) : null
  };
};

export const RoleBadges = ({
  roles,
  catalog,
  max = 2
}: {
  roles: readonly ProjectRoleGrant[];
  catalog: readonly Role[];
  max?: number;
}) => {
  const badge = (grant: ProjectRoleGrant) => {
    const expired = isExpired(grant);
    const node = (
      <Badge key={grant.id} tone={expired ? "bad" : "soft"}>
        {roleName(catalog, grant.role)}
        {grant.isTemporary && <Icon icon={expired ? ClockAlertIcon : ClockIcon} size={12} />}
      </Badge>
    );
    return grant.isTemporary ? (
      <Tooltip key={grant.id} content={expired ? "Access expired" : "Temporary access"}>
        {node}
      </Tooltip>
    ) : (
      node
    );
  };
  const overflow = roles.slice(max);
  return (
    <span className={styles.roles}>
      {roles.slice(0, max).map(badge)}
      {overflow.length > 0 && (
        <Tooltip
          content={overflow
            .map((g) => roleName(catalog, g.role) + (g.isTemporary ? " (temporary)" : ""))
            .join(", ")}
        >
          <Badge tone="outline">{`+${overflow.length}`}</Badge>
        </Tooltip>
      )}
    </span>
  );
};

export const Muted = ({ children }: { children: ReactNode }) => (
  <span className={styles.muted}>{children}</span>
);

export const FabDock = ({ active, children }: { active: boolean; children: ReactNode }) => (
  <div className={styles.fabDock} data-active={active || undefined}>
    {children}
  </div>
);

export const LabelHint = ({ label, hint }: { label: string; hint: string }) => (
  <span className={styles.labelHint}>
    {label}
    <Tooltip content={hint}>
      <button type="button" className={styles.rowHint} aria-label={hint}>
        <Icon icon={InfoIcon} size={12} />
      </button>
    </Tooltip>
  </span>
);
