import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { EnrollmentType } from "@app/hooks/api/certificateProfiles/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm, CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { useV4Adapter } from "../../data/adapters";
import type { TListCertificatesDTO } from "../../data/certificates/contract";
import { v4Path } from "../../links";
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
};

const filtersFromSearch = (search: InventorySearch): FilterBarFilter[] => {
  const filters: FilterBarFilter[] = [];
  if (search.filterStatus) filters.push({ field: "status", values: [search.filterStatus] });
  if (search.filterEnrollmentType)
    filters.push({
      field: "enrollmentType",
      values: [search.filterEnrollmentType]
    });
  if (search.filterKeyAlgorithm)
    filters.push({
      field: "keyAlgorithm",
      values: [search.filterKeyAlgorithm]
    });
  if (search.filterCaId) filters.push({ field: "caId", values: [search.filterCaId] });
  if (search.filterExpiresDays)
    filters.push({
      field: "notAfter",
      operator: "before",
      values: [dateIn(search.filterExpiresDays)]
    });
  else if (search.filterExpiresAfterDays)
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

export const InventoryPage = () => {
  const { orgId } = useParams({ from: routeId });
  const search = useSearch({ from: routeId });
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>(() => filtersFromSearch(search));
  const [hidden, setHidden] = useState<string[]>(["issued", "algorithm"]);
  const [sort, setSort] = useState<{
    columnId: string;
    direction: "asc" | "desc";
  }>({
    columnId: "expires",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isPending } = certificates.useCertificates({
    projectId: projectId ?? "",
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    ...filterParams(filters),
    sortBy: sortKeys[sort.columnId],
    sortOrder: sort.direction
  });
  const { data: stats } = certificates.useDashboardStats(projectId ?? "");
  const { data: authorities = [] } = certificates.useCertificateAuthorities();
  const { data: profiles } = certificates.useCertificateProfiles({
    limit: 100
  });

  if (isResolving) return <Loader size="page" label="Loading certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const rows = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;
  const total = stats?.totals.total ?? totalCount;
  const caType = (cert: TCertificate) => authorities.find((ca) => ca.id === cert.caId)?.type;
  const open = (id: string) =>
    navigate({
      to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
      params: { orgId, certificateId: id }
    });
  const revoking = rows.find((cert) => cert.id === revokeId);
  const deleting = rows.find((cert) => cert.id === deleteId);
  const filtered = Boolean(query.trim()) || filters.some((filter) => filter.values.length > 0);
  const fields: FilterBarField[] = [
    {
      key: "status",
      label: "Status",
      type: "multi-select",
      options: [
        { value: CertStatus.ACTIVE, label: "Active" },
        { value: CertStatus.RENEWED, label: "Renewed" },
        { value: CertStatus.EXPIRED, label: "Expired" },
        { value: CertStatus.REVOKED, label: "Revoked" }
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
      options: (profiles?.certificateProfiles ?? []).map((entry) => ({
        value: entry.id,
        label: entry.slug
      }))
    }
  ];
  const columns: DataTableColumn<TCertificate>[] = [
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
                    gap: "var(--v4-space-8)",
                    marginInlineStart: "var(--v4-space-8)",
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
      render: (r) =>
        enrollmentLabel[r.enrollmentType as EnrollmentType] ?? r.enrollmentType ?? "None"
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
  const clear = () => {
    setQuery("");
    setFilters([]);
    setPage(1);
  };
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Inventory"
          description={
            stats && (stats.totals.expiringSoon || stats.totals.expired)
              ? `Every certificate across your infrastructure. ${plural(stats.totals.expiringSoon, "certificate expires", "certificates expire")} within 30 days and ${stats.totals.expired} ${stats.totals.expired === 1 ? "has" : "have"} expired.`
              : "Every certificate across your infrastructure."
          }
          actions={
            <Button variant="outline" icon="upload">
              Import
            </Button>
          }
        />
        <FilterBar
          label="Certificate filters"
          fields={fields}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search certificates"
              placeholder="Search by SAN, CN, ID or serial number"
              kbd="/"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          }
          actions={
            <>
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
                        setHidden((current) =>
                          checked
                            ? current.filter((id) => id !== column.id)
                            : [...current, column.id]
                        )
                      }
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {rows.length ? (
                <Tooltip content="Export CSV" side="bottom">
                  <Button variant="outline" size="icon" icon="download" iconOnly>
                    Export CSV
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  icon="download"
                  iconOnly
                  disabledReason="No certificates to export"
                >
                  Export CSV
                </Button>
              )}
            </>
          }
        />
        <DataTable
          label="Certificates"
          rows={rows}
          loading={isPending}
          columns={columns.filter((column) => !hidden.includes(column.id))}
          getRowId={(r) => r.id}
          rowLabel={(r) => certificateName(r)}
          rowActions={{
            renderMenu: (r) => {
              const blocks = certificateBlocks(r, {
                isInventoryView: !r.applicationName,
                caType: caType(r)
              });
              return (
                <>
                  <DropdownMenuItem onSelect={() => open(r.id)}>
                    <Icon name="eye" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(blocks.export)} description={blocks.export}>
                    <Icon name="download" />
                    Export certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(blocks.renew)} description={blocks.renew}>
                    <Icon name="sync" />
                    Renew now
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(blocks.sync)} description={blocks.sync}>
                    <Icon name="link" />
                    Manage certificate syncs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(blocks.revoke)}
                    description={blocks.revoke}
                    onSelect={() => setRevokeId(r.id)}
                  >
                    <Icon name="x" />
                    Revoke certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(blocks.delete)}
                    description={blocks.delete}
                    onSelect={() => setDeleteId(r.id)}
                  >
                    <Icon name="trash" />
                    Delete certificate
                  </DropdownMenuItem>
                </>
              );
            }
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
              : `${plural(total, "certificate", "certificates")} from ${plural(authorities.length, "certificate authority", "certificate authorities")}`
          }
          pagination={
            totalCount > pageSize ? (
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
            ) : undefined
          }
        />
      </Stack>
      <RevokeCertificateDialog cert={revoking} onClose={() => setRevokeId(null)} />
      <DeleteCertificateDialog
        cert={deleting}
        caType={deleting ? caType(deleting) : undefined}
        onClose={() => setDeleteId(null)}
      />
    </TooltipProvider>
  );
};
