import { useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { StatusText } from "@infisical/cipher/ui/text";
import { TooltipProvider, TooltipText } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";

import { EnrollmentType } from "@app/hooks/api/certificateProfiles/types";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { errorMessage, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import {
  altNamesOf,
  CertManagerNotSetUp,
  certificateName,
  daysLeft,
  shortDate,
  useCertManagerProjectId
} from "../components/certificate";

const routeId = v4Path("/organizations/$orgId/cert-manager/expiring");
const detailPath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

const WINDOW_DAYS = 90;

const urgencyGroups = [
  { id: "week", label: "Within 7 days", maxDays: 7 },
  { id: "month", label: "8 to 30 days", maxDays: 30 },
  { id: "quarter", label: "31 to 90 days", maxDays: WINDOW_DAYS }
];

const enrollmentLabel: Record<EnrollmentType, string> = {
  [EnrollmentType.API]: "API",
  [EnrollmentType.EST]: "EST",
  [EnrollmentType.ACME]: "ACME",
  [EnrollmentType.SCEP]: "SCEP"
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const remaining = (days: number) => {
  if (days <= 0) return "Today";
  return `In ${plural(days, "day", "days")}`;
};

const urgencyTone = (days: number) => {
  if (days <= 7) return "bad" as const;
  if (days <= 30) return "warn" as const;
  return "outline" as const;
};

const RenewalStatus = ({ cert }: { cert: TCertificate }) => {
  const left = daysLeft(cert.notAfter);
  if (cert.renewalError)
    return (
      <TooltipText content={cert.renewalError} data-row-interactive>
        <StatusText tone="bad" icon="alert-c">
          Renewal failed
        </StatusText>
      </TooltipText>
    );
  if (!cert.renewBeforeDays)
    return (
      <StatusText tone="warn" icon="alert">
        No auto renewal
      </StatusText>
    );
  if (left > cert.renewBeforeDays)
    return (
      <StatusText icon="sync">{`Auto renews in ${plural(left - cert.renewBeforeDays, "day", "days")}`}</StatusText>
    );
  return <StatusText icon="clock">Auto renewal pending</StatusText>;
};

const filterParams = (filters: FilterBarFilter[]) => {
  const values = (field: string) =>
    filters.find((filter) => filter.field === field)?.values.filter(Boolean) ?? [];
  const caIds = values("caId");
  const enrollmentTypes = values("enrollmentType");
  return {
    caIds: caIds.length ? caIds : undefined,
    enrollmentTypes: enrollmentTypes.length ? enrollmentTypes : undefined
  };
};

export const ExpiringCertificatesPage = () => {
  const { orgId } = useParams({ from: routeId });
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const [expiryWindow] = useState(() => {
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + WINDOW_DAYS);
    return { from, to };
  });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isPending, error } = certificates.useCertificates({
    projectId: projectId ?? "",
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    status: CertStatus.ACTIVE,
    notAfterFrom: expiryWindow.from,
    notAfterTo: expiryWindow.to,
    ...filterParams(filters),
    sortBy: "notAfter",
    sortOrder: "asc"
  });
  const { data: stats } = certificates.useDashboardStats(projectId ?? "");
  const { data: authorities = [] } = certificates.useCertificateAuthorities();

  if (isResolving) return <Loader size="page" label="Loading certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const rows = error ? [] : (data?.certificates ?? []);
  const totalCount = error ? 0 : (data?.totalCount ?? 0);
  const filtered = Boolean(query.trim()) || filters.some((filter) => filter.values.length > 0);
  const expired = stats?.totals.expired ?? 0;

  const groups: DataTableGroup<TCertificate>[] = urgencyGroups.map((group, index) => {
    const minDays = index === 0 ? -Infinity : urgencyGroups[index - 1].maxDays;
    const groupRows = rows.filter((cert) => {
      const left = daysLeft(cert.notAfter);
      return left > minDays && (left <= group.maxDays || index === urgencyGroups.length - 1);
    });
    return { id: group.id, label: group.label, meta: groupRows.length, rows: groupRows };
  });

  const open = (cert: TCertificate) =>
    navigate({ to: detailPath, params: { orgId, certificateId: cert.id } });

  const copySerial = (cert: TCertificate) => {
    navigator.clipboard
      ?.writeText(cert.serialNumber)
      .then(() => toast({ tone: "ok", title: "Serial number copied to clipboard" }))
      .catch(() => toast({ tone: "bad", title: "Could not copy the serial number" }));
  };

  const clear = () => {
    setQuery("");
    setFilters([]);
    setPage(1);
  };

  const fields: FilterBarField[] = [
    {
      key: "caId",
      label: "Certificate authority",
      type: "multi-select",
      options: authorities.map((ca) => ({ value: ca.id, label: ca.name || ca.id }))
    },
    {
      key: "enrollmentType",
      label: "Enrollment method",
      type: "multi-select",
      options: Object.entries(enrollmentLabel).map(([value, label]) => ({ value, label }))
    }
  ];

  const columns: DataTableColumn<TCertificate>[] = [
    {
      id: "cn",
      header: "Certificate",
      primary: true,
      grow: true,
      text: (cert) => certificateName(cert),
      render: (cert) => {
        const extra = altNamesOf(cert).length - 1;
        return (
          <RowLink link={{ to: detailPath, params: { orgId, certificateId: cert.id } }}>
            {certificateName(cert)}
            {extra > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  marginInlineStart: "var(--v4-space-8)",
                  verticalAlign: "middle"
                }}
              >
                <Badge size="sm" tone="outline">{`+${extra}`}</Badge>
              </span>
            )}
          </RowLink>
        );
      }
    },
    {
      id: "expires",
      header: "Expires",
      width: 196,
      text: (cert) => shortDate(cert.notAfter),
      render: (cert) => {
        const left = daysLeft(cert.notAfter);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {shortDate(cert.notAfter)}
            <Badge size="sm" tone={urgencyTone(left)}>
              {remaining(left)}
            </Badge>
          </Inline>
        );
      }
    },
    {
      id: "renewal",
      header: "Renewal",
      width: 208,
      render: (cert) => <RenewalStatus cert={cert} />
    },
    {
      id: "application",
      header: "Application",
      width: 152,
      text: (cert) => cert.applicationName ?? "",
      render: (cert) => cert.applicationName ?? "None"
    },
    {
      id: "ca",
      header: "CA",
      width: 176,
      text: (cert) => cert.caName ?? "",
      render: (cert) => cert.caName ?? "None"
    }
  ];

  const empty = (() => {
    if (error)
      return (
        <EmptyState
          size="sm"
          media="bare"
          icon="alert"
          title="Could not load certificates"
          description={errorMessage(error) ?? "Refresh the page to try again."}
        />
      );
    if (filtered)
      return (
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
      );
    return (
      <EmptyState
        size="sm"
        icon="check-c"
        title={`No certificates expire in the next ${WINDOW_DAYS} days`}
      />
    );
  })();

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Expiring certificates"
          description={`Active certificates that expire in the next ${WINDOW_DAYS} days, soonest first.`}
          actions={
            expired > 0 && (
              <Button variant="outline" asChild>
                <a href={orgHref(orgId, "/cert-manager/inventory?filterStatus=expired")}>
                  {`View ${expired} expired`}
                </a>
              </Button>
            )
          }
        />
        <FilterBar
          label="Expiring certificate filters"
          fields={fields}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search expiring certificates"
              placeholder="Search by SAN, CN, ID or serial number"
              kbd="/"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <DataTable
          label="Expiring certificates"
          groups={groups}
          loading={isPending && !error}
          columns={columns}
          getRowId={(cert) => cert.id}
          rowLabel={(cert) => certificateName(cert)}
          rowActions={{
            inline: [{ label: "View details", icon: "eye", onSelect: open }],
            renderMenu: (cert) => (
              <DropdownMenuItem onSelect={() => copySerial(cert)}>
                <Icon name="copy" />
                Copy serial number
              </DropdownMenuItem>
            )
          }}
          empty={empty}
          persistentStatus={
            totalCount > 0
              ? `${plural(totalCount, "certificate expires", "certificates expire")} in the next ${WINDOW_DAYS} days`
              : undefined
          }
          pagination={
            totalCount > pageSize ? (
              <Pagination
                label="Expiring certificate pages"
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
    </TooltipProvider>
  );
};
