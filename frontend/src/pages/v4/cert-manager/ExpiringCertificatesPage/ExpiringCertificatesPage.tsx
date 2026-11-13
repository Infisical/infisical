import { useState } from "react";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup
} from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Link, useParams } from "@tanstack/react-router";

import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  certificateName,
  CertManagerNotSetUp,
  daysLeft,
  shortDate,
  useCertManagerProjectId
} from "../components/certificate";

const routeId = v4Path("/organizations/$orgId/cert-manager/expiring");

const horizonDays = 90;
const pageSize = 100;

const bands = [
  { id: "week", label: "Within 7 days", maxDays: 7, tone: "bad" },
  { id: "month", label: "In 8 to 30 days", maxDays: 30, tone: "warn" },
  { id: "quarter", label: "In 31 to 90 days", maxDays: horizonDays, tone: "outline" }
] as const satisfies readonly { id: string; label: string; maxDays: number; tone: BadgeTone }[];

const bandOf = (cert: TCertificate) =>
  bands.find((band) => daysLeft(cert.notAfter) <= band.maxDays) ?? bands[bands.length - 1];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const timeLeft = (days: number) => {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

const Renewal = ({ cert }: { cert: TCertificate }) => {
  if (cert.renewalError) return <Badge tone="bad">Renewal failed</Badge>;
  if (!cert.renewBeforeDays) return "Auto renewal off";
  const untilRenewal = daysLeft(cert.notAfter) - cert.renewBeforeDays;
  if (untilRenewal <= 0) return <Badge tone="warn">Auto renewal due</Badge>;
  return `Auto renews ${timeLeft(untilRenewal).toLowerCase()}`;
};

export const ExpiringCertificatesPage = () => {
  const { orgId } = useParams({ from: routeId });
  const certificates = useV4Adapter("certificates");
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [range] = useState(() => ({
    from: new Date(),
    to: new Date(Date.now() + horizonDays * 864e5)
  }));

  const { data, isPending, error } = certificates.useCertificates({
    projectId: projectId ?? "",
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    status: CertStatus.ACTIVE,
    notAfterFrom: range.from,
    notAfterTo: range.to,
    sortBy: "notAfter",
    sortOrder: "asc"
  });

  if (isResolving) return <Loader size="page" label="Loading certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const rows = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;
  const groups: DataTableGroup<TCertificate>[] = bands.map((band) => {
    const bandRows = rows.filter((cert) => bandOf(cert).id === band.id);
    return {
      id: band.id,
      label: band.label,
      meta: plural(bandRows.length, "certificate", "certificates"),
      rows: bandRows
    };
  });

  const copySerial = (cert: TCertificate) =>
    navigator.clipboard
      .writeText(cert.serialNumber)
      .then(() => toast({ title: "Serial number copied to clipboard" }))
      .catch((copyError) => failed("Failed to copy serial number", copyError));

  const columns: DataTableColumn<TCertificate>[] = [
    {
      id: "certificate",
      header: "Certificate",
      primary: true,
      grow: true,
      text: (cert) => certificateName(cert),
      render: (cert) => (
        <RowLink
          link={{
            to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
            params: { orgId, certificateId: cert.id }
          }}
        >
          {certificateName(cert)}
        </RowLink>
      )
    },
    {
      id: "expires",
      header: "Expires",
      width: 200,
      render: (cert) => (
        <Inline gap={8} align="center" wrap={false}>
          {shortDate(cert.notAfter)}
          <Badge size="sm" tone={bandOf(cert).tone}>
            {timeLeft(daysLeft(cert.notAfter))}
          </Badge>
        </Inline>
      )
    },
    {
      id: "renewal",
      header: "Renewal",
      width: 184,
      render: (cert) => <Renewal cert={cert} />
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

  let empty = (
    <EmptyState
      size="sm"
      icon="check-c"
      title={`No certificates expire in the next ${horizonDays} days`}
    />
  );
  if (error) empty = <EmptyState size="sm" icon="alert" title="Couldn't load certificates" />;
  else if (query.trim())
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No expiring certificates match"
        actions={
          <Button
            variant="link"
            onClick={() => {
              setQuery("");
              setPage(1);
            }}
          >
            Clear Search
          </Button>
        }
      />
    );

  return (
    <Stack gap={24}>
      <PageHeader
        title="Expiring certificates"
        description={`Active certificates that expire in the next ${horizonDays} days, soonest first.`}
        actions={
          <Button variant="outline" asChild>
            <Link
              to={v4Path("/organizations/$orgId/cert-manager/inventory")}
              params={{ orgId }}
              search={{ filterStatus: CertStatus.ACTIVE, filterExpiresDays: String(horizonDays) }}
            >
              Open in Inventory
            </Link>
          </Button>
        }
      />
      <Input
        icon="search"
        aria-label="Search expiring certificates"
        placeholder="Search by SAN, CN, ID or serial number"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      <DataTable
        label="Expiring certificates"
        groups={error ? [] : groups}
        loading={isPending}
        columns={columns}
        getRowId={(cert) => cert.id}
        rowLabel={(cert) => certificateName(cert)}
        rowActions={{
          inline: [
            {
              label: "Copy serial number",
              icon: "copy",
              onSelect: copySerial
            }
          ]
        }}
        empty={empty}
        pagination={
          totalCount > pageSize ? (
            <Pagination
              label="Expiring certificate pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={pageSize}
            />
          ) : undefined
        }
      />
    </Stack>
  );
};
