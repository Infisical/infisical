import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { HeaderSearch } from "@infisical/cipher/ui/header-search";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { BanIcon, CheckIcon, ShieldIcon, SplitIcon } from "lucide-react";

import type { ProjectType, TPermissionAuditSource } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { Muted } from "../ui";
import {
  type ActionAudit,
  auditCsv,
  type AuditState,
  conditionText,
  evaluateAudit,
  SOURCE_LABEL,
  type SourceRef
} from "./permission-audit";

type StateFilter = AuditState | "all";
type Row = ActionAudit & { key: string };

const STATE_BADGE: Record<
  AuditState,
  { tone: "ok" | "warn" | "bad"; label: string; icon: typeof CheckIcon }
> = {
  allow: { tone: "ok", label: "Allow", icon: CheckIcon },
  conditional: { tone: "warn", label: "Conditional", icon: SplitIcon },
  forbid: { tone: "bad", label: "Forbid", icon: BanIcon }
};

const fileSlug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "audit";

const download = (filename: string, csv: string) => {
  const url = URL.createObjectURL(
    new Blob([`${String.fromCharCode(0xfeff)}${csv}`], { type: "text/csv;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const sourceName = (source: SourceRef) =>
  source.groupName ? `${source.name} (via ${source.groupName})` : source.name;

const sourceTooltip = (source: SourceRef) =>
  [
    SOURCE_LABEL[source.type],
    source.isTemporary && source.temporaryAccessEndTime
      ? `Expires ${new Date(source.temporaryAccessEndTime).toLocaleString()}`
      : undefined
  ]
    .filter(Boolean)
    .join(". ");

const SourceBadges = ({ sources }: { sources: readonly SourceRef[] }) => {
  if (!sources.length) return <Muted>-</Muted>;
  const [first, ...rest] = sources;
  return (
    <Inline gap={4} wrap={false}>
      <Tooltip content={sourceTooltip(first)}>
        <Badge tone="soft" data-row-interactive>
          {sourceName(first)}
        </Badge>
      </Tooltip>
      {rest.length > 0 && (
        <Tooltip content={rest.map(sourceName).join(", ")}>
          <Badge tone="outline" data-row-interactive>
            {`+${rest.length}`}
          </Badge>
        </Tooltip>
      )}
    </Inline>
  );
};

const AccessBadge = ({ audit }: { audit: ActionAudit }) => {
  if (audit.state === "forbid" && !audit.forbiddenBy.length) return <Muted>No grant</Muted>;
  const { tone, label, icon } = STATE_BADGE[audit.state];
  const badge = (
    <Badge tone={tone} icon={icon} data-row-interactive>
      {label}
    </Badge>
  );
  if (!audit.conditions.length) return badge;
  return (
    <Tooltip
      content={audit.conditions
        .flatMap((condition) =>
          conditionText(condition).map((text) =>
            condition.kind === "forbid" ? `Forbid where ${text}` : `Where ${text}`
          )
        )
        .join("\n")}
    >
      {badge}
    </Tooltip>
  );
};

const matches = (values: (string | undefined)[], needle: string) =>
  values.some((value) => value?.toLowerCase().includes(needle));

const columns: DataTableColumn<Row>[] = [
  {
    id: "action",
    header: "Action",
    primary: true,
    grow: true,
    wrap: true,
    text: (row) => row.label,
    secondary: (row) => row.description
  },
  { id: "access", header: "Access", width: 140, render: (row) => <AccessBadge audit={row} /> },
  {
    id: "source",
    header: "Granted by",
    width: 220,
    render: (row) => (
      <SourceBadges sources={row.grantedBy.length ? row.grantedBy : row.forbiddenBy} />
    )
  }
];

export const PermissionAuditSheet = ({
  open,
  onOpenChange,
  targetName,
  projectName,
  projectType,
  sources,
  isPending,
  isError
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  projectName: string;
  projectType: ProjectType;
  sources?: readonly TPermissionAuditSource[];
  isPending: boolean;
  isError?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const resources = useMemo(
    () => evaluateAudit(projectType, sources ?? []),
    [projectType, sources]
  );
  const all = resources.flatMap((resource) => resource.actions);
  const count = (filter: StateFilter) =>
    filter === "all" ? all.length : all.filter((audit) => audit.state === filter).length;
  const needle = search.trim().toLowerCase();
  const groups = resources
    .map((resource) => {
      const resourceHit = matches([resource.label, resource.description], needle);
      return {
        id: resource.subject,
        label: resource.label,
        meta: resource.grantedCount
          ? `${resource.grantedCount}/${resource.totalCount}`
          : "No access",
        rows: resource.actions
          .filter((audit) => state === "all" || audit.state === state)
          .filter(
            (audit) =>
              resourceHit ||
              matches(
                [
                  audit.label,
                  audit.description,
                  ...audit.grantedBy.map((source) => source.name),
                  ...audit.forbiddenBy.map((source) => source.name)
                ],
                needle
              )
          )
          .map((audit) => ({ ...audit, key: `${resource.subject}:${audit.action}` }))
      };
    })
    .filter((group) => group.rows.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{`Permission audit: ${targetName}`}</SheetTitle>
        </SheetHeader>
        <SheetSubheader>
          <Inline gap={8} justify="between">
            <Inline gap={8}>
              <Select
                label="Access"
                size="sm"
                width="md"
                value={state}
                onChange={(value) => setState(value as StateFilter)}
                options={(
                  [
                    ["all", "All"],
                    ["allow", "Allowed"],
                    ["conditional", "Conditional"],
                    ["forbid", "Forbidden"]
                  ] as const
                ).map(([value, label]) => ({ value, label: `${label} (${count(value)})` }))}
              />
              <HeaderSearch
                label="Search resources, actions or sources"
                placeholder="Search resources, actions or sources"
                value={search}
                onValueChange={setSearch}
              />
            </Inline>
            <Button
              variant="outline"
              size="sm"
              icon="download"
              disabled={isPending || !sources}
              onClick={() =>
                download(
                  `permission-audit-${fileSlug(projectName)}-${fileSlug(targetName)}-${new Date()
                    .toISOString()
                    .slice(0, 10)}.csv`,
                  auditCsv(resources)
                )
              }
            >
              Export CSV
            </Button>
          </Inline>
        </SheetSubheader>
        <SheetBody>
          {isError ? (
            <Alert tone="bad" title="Could not load permission audit">
              {`Close and reopen the audit to load the effective permissions of ${targetName}.`}
            </Alert>
          ) : (
            <Stack gap={12}>
              <DataTable
                label="Effective permissions"
                columns={columns}
                groups={groups}
                loading={isPending}
                loadingRows={8}
                getRowId={(row) => row.key}
                rowLabel={(row) => row.label}
                empty={
                  <EmptyState
                    size="sm"
                    icon="search"
                    title="No matching permissions"
                    description="Clear the search or access filter."
                  />
                }
              />
            </Stack>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

type AuditTarget = { membershipId: string } | { identityId: string };

export const PermissionAuditAction = ({
  projectId,
  projectType,
  target,
  targetName
}: {
  projectId: string;
  projectType: ProjectType;
  target: AuditTarget;
  targetName: string;
}) => {
  const [open, setOpen] = useState(false);
  const access = useV4Adapter("access");
  const isMember = "membershipId" in target;
  const memberAudit = access.useMembershipPermissionAudit(
    projectId,
    isMember ? target.membershipId : "",
    { enabled: open && isMember }
  );
  const identityAudit = access.useIdentityPermissionAudit(
    projectId,
    isMember ? "" : target.identityId,
    { enabled: open && !isMember }
  );
  const project = access.useProject(projectId);
  const audit = isMember ? memberAudit : identityAudit;
  return (
    <>
      <Button variant="outline" icon={ShieldIcon} onClick={() => setOpen(true)}>
        Permission audit
      </Button>
      {open && (
        <PermissionAuditSheet
          open={open}
          onOpenChange={setOpen}
          targetName={targetName}
          projectName={project.data?.name ?? projectId}
          projectType={projectType}
          sources={audit.data?.sources}
          isPending={audit.isPending}
          isError={Boolean(audit.error)}
        />
      )}
    </>
  );
};
