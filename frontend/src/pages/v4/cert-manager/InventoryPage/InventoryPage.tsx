import { useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import FileSaver from "file-saver";

import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { CaType } from "@app/hooks/api/ca/enums";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { EnrollmentType, type TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm, CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import { getApplicationCertificateAccess } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { useProjectPermission } from "../../access/permissions";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { TListCertificatesDTO } from "../../data/certificates/contract";
import { v4Path } from "../../links";
import { CertificateSyncsDialog } from "../CertificateDetailsByIDPage/certificate-syncs";
import {
  certificateBlocks,
  certificateName,
  CertificateStatusBadge,
  DeleteCertificateDialog,
  ExpiryBadge,
  RevokeCertificateDialog,
  shortDate,
  CertManagerNotSetUp,
  useCertManagerProjectId
} from "../components/certificate";
import { ExportCertificateDialog } from "../components/certificate-export";
import { ImportCertificatesSheet } from "../components/certificate-requests/import-sheet";
import { RenewCertificateSheet } from "../components/certificate-requests/renew-sheet";
import { AssignApplicationDialog } from "./assign-application-dialog";
import { certificatesToCsv } from "./csv-export";
import { type InventoryView, InventoryViewsMenu, type InventoryViewScope } from "./inventory-views";
import { VIEW_KEY_ALGORITHMS } from "./view-key-algorithms";

const routeId = v4Path("/organizations/$orgId/cert-manager/inventory");

const options = (entries: Record<string, string>) =>
  Object.entries(entries).map(([value, label]) => ({ value, label }));
const enrollmentLabel: Record<EnrollmentType, string> = {
  [EnrollmentType.API]: "API",
  [EnrollmentType.EST]: "EST",
  [EnrollmentType.ACME]: "ACME",
  [EnrollmentType.SCEP]: "SCEP"
};

const dateIn = (days: string) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().split("T")[0];
};

type InventorySearch = {
  filterStatus?: string;
  filterEnrollmentType?: string;
  filterKeyAlgorithm?: string;
  filterCaId?: string;
  filterExpiresDays?: string;
  filterExpiresAfterDays?: string;
  viewId?: string;
};

const filtersFromSearch = (search: InventorySearch): FilterBarFilter[] => {
  const filters: FilterBarFilter[] = [];
  if (search.filterStatus) filters.push({ field: "status", values: [search.filterStatus] });
  if (search.filterEnrollmentType)
    filters.push({
      field: "enrollmentType",
      values: [search.filterEnrollmentType]
    });
  const viewAlgorithms = VIEW_KEY_ALGORITHMS[search.viewId ?? ""];
  if (search.filterKeyAlgorithm)
    filters.push({
      field: "keyAlgorithm",
      values: [search.filterKeyAlgorithm]
    });
  else if (viewAlgorithms) filters.push({ field: "keyAlgorithm", values: [...viewAlgorithms] });
  if (search.filterCaId) filters.push({ field: "caId", values: [search.filterCaId] });
  if (search.filterExpiresDays)
    filters.push({
      field: "notAfter",
      operator: "before",
      values: [dateIn(search.filterExpiresDays)]
    });
  if (search.filterExpiresAfterDays)
    filters.push({
      field: "notAfter",
      operator: "after",
      values: [dateIn(search.filterExpiresAfterDays)]
    });
  return filters;
};

const filterParams = (filters: FilterBarFilter[]): Partial<TListCertificatesDTO> => {
  const params: Partial<TListCertificatesDTO> = {};
  filters.forEach(({ field, operator, values }) => {
    if (!values.length) return;
    if (field === "notAfter" || field === "notBefore") {
      const date = new Date(values[0]);
      const bound = operator === "after" ? "From" : "To";
      params[`${field}${bound}`] = date;
      return;
    }
    if (field === "status") params.status = values.join(",");
    if (field === "enrollmentType") params.enrollmentTypes = values;
    if (field === "keyAlgorithm") params.keyAlgorithm = values;
    if (field === "keySize") params.keySizes = values.map(Number);
    if (field === "source") params.source = values;
    if (field === "caId") params.caIds = values;
    if (field === "profileId") params.profileIds = values;
  });
  return params;
};

const sortKeys: Record<string, string> = {
  expires: "notAfter",
  issued: "notBefore"
};

const optionalColumns = [
  { id: "serial", label: "Serial number" },
  { id: "enrollment", label: "Enrollment" },
  { id: "issued", label: "Issued" },
  { id: "profile", label: "Profile" },
  { id: "algorithm", label: "Algorithm" }
];

const algorithmLabel = (algorithm?: string | null) =>
  (algorithm && certKeyAlgorithmToNameMap[algorithm as CertKeyAlgorithm]) || algorithm || "None";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const inventoryFields = (
  authorities: TUnifiedCertificateAuthority[],
  profiles: TCertificateProfile[]
): FilterBarField[] => [
  {
    key: "status",
    label: "Status",
    type: "multi-select",
    options: [
      { value: CertStatus.ACTIVE, label: "Active" },
      { value: CertStatus.RENEWED, label: "Renewed" },
      { value: CertStatus.EXPIRED, label: "Expired" },
      { value: CertStatus.REVOKED, label: "Revoked" },
      { value: CertStatus.DELETED, label: "Deleted" }
    ]
  },
  { key: "notAfter", label: "Expiration date", type: "date" },
  { key: "notBefore", label: "Issued date", type: "date" },
  {
    key: "enrollmentType",
    label: "Enrollment method",
    type: "multi-select",
    options: options(enrollmentLabel)
  },
  {
    key: "keyAlgorithm",
    label: "Algorithm",
    type: "multi-select",
    options: options(certKeyAlgorithmToNameMap)
  },
  {
    key: "keySize",
    label: "Key size",
    type: "multi-select",
    options: [
      { value: "256", label: "256-bit (ECDSA)" },
      { value: "384", label: "384-bit (ECDSA)" },
      { value: "521", label: "521-bit (ECDSA)" },
      { value: "2048", label: "2048-bit (RSA)" },
      { value: "3072", label: "3072-bit (RSA)" },
      { value: "4096", label: "4096-bit (RSA)" }
    ]
  },
  {
    key: "source",
    label: "Source",
    type: "multi-select",
    options: [
      { value: CertSource.Issued, label: "Managed" },
      { value: CertSource.Discovered, label: "Discovered" },
      { value: CertSource.Imported, label: "Imported" }
    ]
  },
  {
    key: "caId",
    label: "Certificate authority",
    type: "multi-select",
    options: authorities.map((ca) => ({
      value: ca.id,
      label: ca.name || ca.id
    }))
  },
  {
    key: "profileId",
    label: "Profile",
    type: "multi-select",
    options: profiles.map((entry) => ({
      value: entry.id,
      label: entry.slug
    }))
  }
];

const inventoryColumns = (orgId: string): DataTableColumn<TCertificate>[] => [
  {
    id: "cn",
    header: "SAN / CN",
    primary: true,
    grow: true,
    text: (r) => certificateName(r),
    render: (r) => {
      const extra = (r.altNames?.split(",").filter(Boolean).length ?? 0) - 1;
      return (
        <Inline gap={8} align="center" wrap={false}>
          <RowLink
            link={{
              to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
              params: { orgId, certificateId: r.id }
            }}
          >
            {certificateName(r)}
            {extra > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--cipher-space-8)",
                  marginInlineStart: "var(--cipher-space-8)",
                  verticalAlign: "middle"
                }}
              >
                <Badge size="sm" tone="outline">{`+${extra}`}</Badge>
              </span>
            )}
          </RowLink>
        </Inline>
      );
    }
  },
  {
    id: "serial",
    header: "Serial number",
    width: 128,
    text: (r) => r.serialNumber,
    render: (r) => <code>{`${r.serialNumber.slice(0, 5)}…${r.serialNumber.slice(-5)}`}</code>
  },
  {
    id: "enrollment",
    header: "Enrollment",
    width: 96,
    render: (r) => enrollmentLabel[r.enrollmentType as EnrollmentType] ?? r.enrollmentType ?? "None"
  },
  {
    id: "status",
    header: "Status",
    width: 112,
    render: (r) => <CertificateStatusBadge cert={r} />
  },
  {
    id: "issued",
    header: "Issued",
    sortable: true,
    width: 112,
    render: (r) => shortDate(r.notBefore)
  },
  {
    id: "expires",
    header: "Expires",
    sortable: true,
    width: 184,
    render: (r) => (
      <Inline gap={8} align="center" wrap={false}>
        {shortDate(r.notAfter)}
        <ExpiryBadge cert={r} />
      </Inline>
    )
  },
  {
    id: "ca",
    header: "CA",
    width: 176,
    text: (r) => r.caName ?? "",
    render: (r) => r.caName ?? "None"
  },
  {
    id: "profile",
    header: "Profile",
    width: 128,
    render: (r) => (r.profileName ? <code>{r.profileName}</code> : "None")
  },
  {
    id: "algorithm",
    header: "Algorithm",
    width: 104,
    render: (r) => algorithmLabel(r.keyAlgorithm)
  }
];

type RowActionKind = "export" | "renew" | "sync" | "assign" | "revoke" | "delete";
type RowAction = { kind: RowActionKind; cert: TCertificate };

const InventoryRowMenu = ({
  cert,
  caType,
  isAdmin,
  onView,
  onAction
}: {
  cert: TCertificate;
  caType?: CaType;
  isAdmin: boolean;
  onView: () => void;
  onAction: (kind: RowActionKind) => void;
}) => {
  const blocks = certificateBlocks(cert, { isInventoryView: !cert.applicationName, caType });
  return (
    <>
      <DropdownMenuItem onSelect={onView}>
        <Icon name="eye" />
        View details
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={blocks.export} onSelect={() => onAction("export")}>
        <Icon name="download" />
        Export certificate
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={blocks.renew} onSelect={() => onAction("renew")}>
        <Icon name="sync" />
        Renew now
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={blocks.sync} onSelect={() => onAction("sync")}>
        <Icon name="link" />
        Manage certificate syncs
      </DropdownMenuItem>
      {!cert.applicationId && !cert.deletedAt && (
        <DropdownMenuItem
          disabledReason={isAdmin ? undefined : RESTRICTED}
          onSelect={() => onAction("assign")}
        >
          <Icon name="apps" />
          Assign to application
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={blocks.revoke}
        onSelect={() => onAction("revoke")}
      >
        <Icon name="x" />
        Revoke certificate
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabledReason={blocks.delete}
        onSelect={() => onAction("delete")}
      >
        <Icon name="trash" />
        Delete certificate
      </DropdownMenuItem>
    </>
  );
};

const InventoryRenewSheet = ({
  cert,
  projectId,
  onClose
}: {
  cert: TCertificate;
  projectId: string;
  onClose: () => void;
}) => {
  const { permission } = useProjectPermission(projectId);
  const { data: appAccess } = useV4Adapter("pkiApplications").useApplicationPermissions(
    cert.applicationId ?? ""
  );
  const canRevoke = cert.applicationId
    ? getApplicationCertificateAccess({
        applicationName: cert.applicationName ?? "this application",
        permission: appAccess?.permission
      }).canDelete
    : permission.can(ProjectPermissionCertificateActions.Delete, ProjectPermissionSub.Certificates);
  return (
    <RenewCertificateSheet
      cert={cert}
      applicationName={cert.applicationName ?? undefined}
      canRevoke={canRevoke}
      onClose={onClose}
    />
  );
};

const InventoryRowDialogs = ({
  action: { kind, cert },
  caType,
  projectId,
  onClose
}: {
  action: RowAction;
  caType?: CaType;
  projectId: string;
  onClose: () => void;
}) => {
  switch (kind) {
    case "export":
      return <ExportCertificateDialog cert={cert} projectId={projectId} onClose={onClose} />;
    case "renew":
      return <InventoryRenewSheet cert={cert} projectId={projectId} onClose={onClose} />;
    case "sync":
      return (
        <CertificateSyncsDialog
          open
          onOpenChange={(next) => !next && onClose()}
          certificate={cert}
          projectId={projectId}
        />
      );
    case "assign":
      return <AssignApplicationDialog cert={cert} onClose={onClose} />;
    case "revoke":
      return <RevokeCertificateDialog cert={cert} onClose={onClose} />;
    default:
      return (
        <DeleteCertificateDialog
          cert={cert}
          caType={caType}
          projectId={projectId}
          onClose={onClose}
        />
      );
  }
};

const inventoryDescription = (totals?: { expiringSoon: number; expired: number }) =>
  totals && (totals.expiringSoon || totals.expired)
    ? `Every certificate across your infrastructure. ${plural(totals.expiringSoon, "certificate expires", "certificates expire")} within 30 days and ${totals.expired} ${totals.expired === 1 ? "has" : "have"} expired.`
    : "Every certificate across your infrastructure.";

const sourceLine = (total: number, authorities: number) =>
  `${plural(total, "certificate", "certificates")} from ${plural(authorities, "certificate authority", "certificate authorities")}`;

const useInventoryAccess = (projectId: string) => {
  const { permission } = useProjectPermission(projectId);
  const { data: access } = useV4Adapter("certificates").useProjectPermission({ projectId });
  const can = (action: ProjectPermissionCertificateActions) =>
    permission.can(action, ProjectPermissionSub.Certificates);
  return {
    canImport: can(ProjectPermissionCertificateActions.Import),
    isAdmin: Boolean(
      access?.memberships.some((membership) =>
        membership.roles.some((role) => role.role === "admin")
      )
    )
  };
};

const ColumnsMenu = ({
  hidden,
  onChange
}: {
  hidden: string[];
  onChange: (next: string[]) => void;
}) => (
  <DropdownMenu>
    <Tooltip content="Columns" side="bottom">
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" icon="sidebar" iconOnly>
          Columns
        </Button>
      </DropdownMenuTrigger>
    </Tooltip>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>Columns</DropdownMenuLabel>
      {optionalColumns.map((column) => (
        <DropdownMenuCheckboxItem
          key={column.id}
          checked={!hidden.includes(column.id)}
          onCheckedChange={(checked) =>
            onChange(checked ? hidden.filter((id) => id !== column.id) : [...hidden, column.id])
          }
        >
          {column.label}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const ExportCsvButton = ({ rows }: { rows: TCertificate[] }) => {
  const button = (
    <Button
      variant="outline"
      size="icon"
      icon="download"
      iconOnly
      disabledReason={rows.length ? undefined : "No certificates to export"}
      onClick={() =>
        FileSaver.saveAs(
          new Blob([certificatesToCsv(rows)], { type: "text/csv;charset=utf-8;" }),
          `certificates-export-${new Date().toISOString().split("T")[0]}.csv`
        )
      }
    >
      Export CSV
    </Button>
  );
  return rows.length ? (
    <Tooltip content="Export CSV" side="bottom">
      {button}
    </Tooltip>
  ) : (
    button
  );
};

const Inventory = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const search = useSearch({ from: routeId });
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>(() => filtersFromSearch(search));
  const [hidden, setHidden] = useState<string[]>(["issued", "algorithm"]);
  const hiddenSet = new Set(hidden);
  const [sort, setSort] = useState<{
    columnId: string;
    direction: "asc" | "desc";
  }>({
    columnId: "expires",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [importing, setImporting] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(search.viewId ?? null);
  const [viewScope, setViewScope] = useState<InventoryViewScope>();
  const [action, setAction] = useState<RowAction>();

  const { data, isPending } = certificates.useCertificates({
    projectId,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    ...filterParams(filters),
    includeDeleted: includeDeleted || undefined,
    applicationIds: viewScope?.applicationIds,
    metadataFilter: viewScope?.metadata,
    sortBy: sortKeys[sort.columnId],
    sortOrder: sort.direction
  });
  const { data: stats } = certificates.useDashboardStats(projectId);
  const { canImport, isAdmin } = useInventoryAccess(projectId);
  const { data: authorities = [] } = certificates.useCertificateAuthorities();
  const { data: profiles } = certificates.useCertificateProfiles({
    limit: 100
  });

  const rows = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;
  const total = stats?.totals.total ?? totalCount;
  const caType = (cert: TCertificate) => authorities.find((ca) => ca.id === cert.caId)?.type;
  const open = (id: string) =>
    navigate({
      to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
      params: { orgId, certificateId: id }
    });
  const filtered = Boolean(query.trim()) || filters.some((filter) => filter.values.length > 0);
  const clear = () => {
    setQuery("");
    setFilters([]);
    setIncludeDeleted(false);
    setActiveViewId(null);
    setViewScope(undefined);
    setPage(1);
  };
  const applyView = (viewId: string | null, view: InventoryView) => {
    setActiveViewId(viewId);
    setFilters(view.filters);
    setIncludeDeleted(view.includeDeleted);
    setViewScope(view.scope);
    setPage(1);
  };
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Inventory"
          description={inventoryDescription(stats?.totals)}
          actions={
            <Button
              variant="outline"
              icon="upload"
              disabledReason={canImport ? undefined : RESTRICTED}
              onClick={() => setImporting(true)}
            >
              Import
            </Button>
          }
        />
        {importing && <ImportCertificatesSheet onClose={() => setImporting(false)} />}
        <FilterBar
          label="Certificate filters"
          fields={inventoryFields(authorities, profiles?.certificateProfiles ?? [])}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setActiveViewId(null);
            setViewScope(undefined);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search certificates"
              placeholder="Search by SAN, CN, ID or serial number"
              slashShortcut
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          }
          actions={
            <>
              <InventoryViewsMenu
                projectId={projectId}
                activeViewId={activeViewId}
                current={{ filters, includeDeleted, scope: viewScope }}
                onSelect={applyView}
              />
              <ColumnsMenu hidden={hidden} onChange={setHidden} />
              <ExportCsvButton rows={rows} />
            </>
          }
        />
        <DataTable
          label="Certificates"
          rows={rows}
          loading={isPending}
          columns={inventoryColumns(orgId).filter((column) => !hiddenSet.has(column.id))}
          getRowId={(r) => r.id}
          rowLabel={(r) => certificateName(r)}
          rowActions={{
            renderMenu: (r) => (
              <InventoryRowMenu
                cert={r}
                caType={caType(r)}
                isAdmin={isAdmin}
                onView={() => open(r.id)}
                onAction={(kind) => setAction({ kind, cert: r })}
              />
            )
          }}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          empty={
            <EmptyState
              size="sm"
              icon="search"
              title="No certificates match"
              actions={
                <Button variant="link" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          }
          persistentStatus={
            filtered
              ? `${totalCount} of ${plural(total, "certificate", "certificates")}`
              : sourceLine(total, authorities.length)
          }
          pagination={
            totalCount > pageSize && (
              <Pagination
                label="Certificate pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[25, 50, 100]}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            )
          }
        />
      </Stack>
      {action && (
        <InventoryRowDialogs
          action={action}
          caType={caType(action.cert)}
          projectId={projectId}
          onClose={() => setAction(undefined)}
        />
      )}
    </TooltipProvider>
  );
};

export const InventoryPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <Loader size="page" label="Loading certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  return <Inventory orgId={orgId} projectId={projectId} />;
};
