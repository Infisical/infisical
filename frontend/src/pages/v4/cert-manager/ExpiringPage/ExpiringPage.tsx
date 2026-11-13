import { useState } from "react";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow, ListSection } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Link, useParams } from "@tanstack/react-router";

import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  certificateName,
  CertManagerNotSetUp,
  shortDate,
  useCertManagerProjectId
} from "../components/certificate";

const routeId = v4Path("/organizations/$orgId/cert-manager/expiring");
const inventoryPath = v4Path("/organizations/$orgId/cert-manager/inventory");
const detailPath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

const windowDays = 90;
const pageLimit = 100;

const bands = [
  { id: "week", label: "Within 7 days", until: 7 },
  { id: "month", label: "8 to 30 days", until: 30 },
  { id: "quarter", label: "31 to 90 days", until: windowDays }
];

const pluralRules = new Intl.PluralRules("en-US");
const plural = (count: number, one: string, other: string) =>
  `${count} ${pluralRules.select(count) === "one" ? one : other}`;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const daysUntil = (date: string, now: Date) =>
  Math.max(0, Math.round((startOfDay(new Date(date)) - startOfDay(now)) / 864e5));

const relative = (days: number) => {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${plural(days, "day", "days")}`;
};

const dueLabel = (days: number) => {
  const label = relative(days);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const details = (cert: TCertificate) => {
  const expires = `Expires ${shortDate(cert.notAfter)}`;
  if (!cert.caName) return expires;
  const issued = `${expires}, issued by ${cert.caName}`;
  return cert.applicationName ? `${issued} for ${cert.applicationName}` : issued;
};

const isManaged = (cert: TCertificate) => (cert.source ?? CertSource.Issued) === CertSource.Issued;

const renewal = (cert: TCertificate, days: number): { tone: BadgeTone; label: string } => {
  if (cert.source === CertSource.Discovered) return { tone: "outline", label: "Discovered" };
  if (cert.source === CertSource.Imported) return { tone: "outline", label: "Imported" };
  if (!cert.renewBeforeDays) return { tone: "warn", label: "No auto-renewal" };
  const runsIn = days - cert.renewBeforeDays;
  if (runsIn > 0) return { tone: "ok", label: `Auto-renews ${relative(runsIn)}` };
  return { tone: "warn", label: "Auto-renewal pending" };
};

export const ExpiringPage = () => {
  const { orgId } = useParams({ from: routeId });
  const certificates = useV4Adapter("certificates");
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const [range] = useState(() => {
    const now = new Date();
    return { now, until: new Date(now.getTime() + windowDays * 864e5) };
  });

  const { data, isPending, error } = certificates.useCertificates({
    projectId: projectId ?? "",
    offset: 0,
    limit: pageLimit,
    status: CertStatus.ACTIVE,
    notAfterFrom: range.now,
    notAfterTo: range.until,
    sortBy: "notAfter",
    sortOrder: "asc"
  });

  if (isResolving) return <Loader size="page" label="Loading certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const entries = (data?.certificates ?? []).map((cert) => ({
    cert,
    days: daysUntil(cert.notAfter, range.now)
  }));
  const total = data?.totalCount ?? 0;
  const manual = entries.filter(({ cert }) => isManaged(cert) && !cert.renewBeforeDays).length;
  const inventoryLink = (
    <Link
      to={inventoryPath}
      params={{ orgId }}
      search={{ filterStatus: CertStatus.ACTIVE, filterExpiresDays: String(windowDays) }}
    >
      View in inventory
    </Link>
  );

  const summary = () => {
    if (!total) return undefined;
    const expiring = `${plural(total, "certificate expires", "certificates expire")} in the next ${windowDays} days.`;
    if (!manual || total > entries.length) return expiring;
    return `${expiring} ${plural(manual, "has", "have")} no auto-renewal.`;
  };

  const sections = bands.map((band, index) => {
    const from = index === 0 ? 0 : bands[index - 1].until + 1;
    const items = entries.filter(({ days }) => days >= from && days <= band.until);
    if (!items.length) return null;
    return (
      <ListSection key={band.id} label={band.label} meta={items.length}>
        {items.map(({ cert, days }) => {
          const name = certificateName(cert);
          const status = renewal(cert, days);
          return (
            <ListRow
              key={cert.id}
              value={cert.id}
              label={name}
              title={name}
              link={{ to: detailPath, params: { orgId, certificateId: cert.id } }}
              description={details(cert)}
              badge={
                <Badge size="sm" tone={status.tone}>
                  {status.label}
                </Badge>
              }
              meta={dueLabel(days)}
            />
          );
        })}
      </ListSection>
    );
  });

  return (
    <Stack gap={24}>
      <PageHeader
        title="Expiring certificates"
        description={summary()}
        actions={
          <Button variant="outline" asChild>
            {inventoryLink}
          </Button>
        }
      />
      <List
        label="Expiring certificates"
        loading={isPending && !error}
        loadingRows={6}
        empty={
          error ? (
            <EmptyState
              size="sm"
              icon="alert"
              title="Couldn't load expiring certificates"
              actions={
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon="check-c"
              title={`No certificates expire in the next ${windowDays} days`}
            />
          )
        }
        footer={
          total > entries.length
            ? `Showing the ${entries.length} that expire soonest of ${total}. View the rest in the inventory.`
            : undefined
        }
      >
        {error ? [] : sections}
      </List>
    </Stack>
  );
};
