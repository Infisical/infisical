import { useState } from "react";
import { Badge, type BadgeTone, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import {
  altNamesOf,
  certificateBlocks,
  certificateName,
  CertManagerNotSetUp,
  daysLeft,
  DeleteCertificateDialog,
  RevokeCertificateDialog,
  shortDate,
  useCertManagerProjectId
} from "../components/certificate";

const routeId = v4Path("/organizations/$orgId/cert-manager/expiring");
const detailPath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

const HORIZON_DAYS = 90;
const FETCH_LIMIT = 100;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const windows = [
  { id: "week", label: "Within 7 days", upTo: 7 },
  { id: "month", label: "8 to 30 days", upTo: 30 },
  { id: "quarter", label: "31 to 90 days", upTo: HORIZON_DAYS }
] as const;

const urgencyTone = (left: number): BadgeTone => {
  if (left <= 7) return "bad";
  if (left <= 30) return "warn";
  return "soft";
};

const countdown = (left: number) => {
  if (left <= 0) return "Within a day";
  return `In ${plural(left, "day", "days")}`;
};

type Renewal = {
  tone: "ok" | "warn" | "bad" | "neutral";
  icon: IconName;
  label: string;
  detail?: string;
  needsAction: boolean;
};

const renewalOf = (cert: TCertificate): Renewal => {
  if (cert.renewalError)
    return {
      tone: "bad",
      icon: "alert-c",
      label: "Auto-renewal failed",
      detail: cert.renewalError,
      needsAction: true
    };
  if (!cert.renewBeforeDays)
    return { tone: "warn", icon: "alert", label: "No auto-renewal", needsAction: true };
  const runsIn = daysLeft(cert.notAfter) - cert.renewBeforeDays;
  if (runsIn < 0)
    return { tone: "warn", icon: "clock", label: "Auto-renewal overdue", needsAction: true };
  if (runsIn === 0)
    return { tone: "neutral", icon: "clock", label: "Auto-renews today", needsAction: false };
  return {
    tone: "ok",
    icon: "sync",
    label: `Auto-renews in ${plural(runsIn, "day", "days")}`,
    needsAction: false
  };
};

const startOfHour = () => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return date;
};

const horizonFrom = (from: Date) => {
  const date = new Date(from);
  date.setDate(date.getDate() + HORIZON_DAYS);
  return date;
};

export const ExpiringPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { view = "all" } = useSearch({ from: routeId });
  const navigate = useNavigate({ from: routeId });
  const certificates = useV4Adapter("certificates");
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const [range] = useState(() => {
    const from = startOfHour();
    return { from, to: horizonFrom(from) };
  });
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isPending, error, refetch } = certificates.useCertificates({
    projectId: projectId ?? "",
    offset: 0,
    limit: FETCH_LIMIT,
    status: CertStatus.ACTIVE,
    notAfterFrom: range.from,
    notAfterTo: range.to,
    sortBy: "notAfter",
    sortOrder: "asc"
  });
  const { data: authorities = [] } = certificates.useCertificateAuthorities();

  if (isResolving) return <Loader size="page" label="Loading expiring certificates" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const expiring = (data?.certificates ?? []).filter((cert) => !cert.renewedByCertificateId);
  const totalCount = data?.totalCount ?? 0;
  const needsAction = expiring.filter((cert) => renewalOf(cert).needsAction);
  const critical = expiring.filter((cert) => daysLeft(cert.notAfter) <= 7).length;
  const shown = view === "action" ? needsAction : expiring;
  const groups: DataTableGroup<TCertificate>[] = windows.map((window, index) => {
    const floor = index === 0 ? -Infinity : windows[index - 1].upTo;
    const rows = shown.filter((cert) => {
      const left = daysLeft(cert.notAfter);
      return left > floor && left <= window.upTo;
    });
    return {
      id: window.id,
      label: window.label,
      meta: plural(rows.length, "certificate", "certificates"),
      rows
    };
  });

  const caType = (cert: TCertificate) => authorities.find((ca) => ca.id === cert.caId)?.type;
  const revoking = expiring.find((cert) => cert.id === revokeId);
  const deleting = expiring.find((cert) => cert.id === deleteId);
  const inventoryHref = orgHref(
    orgId,
    `/cert-manager/inventory?filterStatus=${CertStatus.ACTIVE}&filterExpiresDays=${HORIZON_DAYS}`
  );
  const setView = (next: "all" | "action") =>
    navigate({ search: (prev) => ({ ...prev, view: next === "all" ? undefined : next }) });

  const columns: DataTableColumn<TCertificate>[] = [
    {
      id: "certificate",
      header: "Certificate",
      primary: true,
      grow: true,
      minWidth: 240,
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
      width: 216,
      text: (cert) => shortDate(cert.notAfter),
      render: (cert) => {
        const left = daysLeft(cert.notAfter);
        return (
          <Inline gap={8} align="center" wrap={false}>
            <Badge size="sm" tone={urgencyTone(left)}>
              {countdown(left)}
            </Badge>
            <Meta mono>{shortDate(cert.notAfter)}</Meta>
          </Inline>
        );
      }
    },
    {
      id: "renewal",
      header: "Renewal",
      width: 208,
      text: (cert) => renewalOf(cert).label,
      render: (cert) => {
        const renewal = renewalOf(cert);
        const status = (
          <StatusText tone={renewal.tone} icon={renewal.icon}>
            {renewal.label}
          </StatusText>
        );
        if (!renewal.detail) return status;
        return (
          <Tooltip content={renewal.detail} side="bottom">
            <span data-row-interactive>{status}</span>
          </Tooltip>
        );
      }
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
      title={`No certificates expire in the next ${HORIZON_DAYS} days`}
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load expiring certificates"
        description={error instanceof Error ? error.message : undefined}
        actions={
          <Button variant="outline" icon="sync" onClick={() => refetch()}>
            Try Again
          </Button>
        }
      />
    );
  else if (view === "action" && expiring.length)
    empty = (
      <EmptyState
        size="sm"
        icon="check-c"
        title="Every expiring certificate renews automatically"
        actions={
          <Button variant="link" onClick={() => setView("all")}>
            Show all
          </Button>
        }
      />
    );

  const truncated = totalCount > expiring.length;
  let status: string | undefined;
  if (!error && !isPending && expiring.length) {
    if (truncated)
      status = `Showing the ${expiring.length} soonest of ${totalCount} expiring certificates`;
    else if (view === "action")
      status = `${needsAction.length} of ${plural(expiring.length, "certificate needs", "certificates need")} action`;
    else status = plural(expiring.length, "certificate", "certificates");
  }

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Expiring certificates"
          description={
            expiring.length
              ? `${plural(totalCount, "certificate expires", "certificates expire")} in the next ${HORIZON_DAYS} days, ${critical} within 7 days.`
              : undefined
          }
          actions={
            <>
              {expiring.length > 0 && (
                <ToggleGroup
                  type="single"
                  aria-label="Certificates shown"
                  value={view}
                  onValueChange={(value) => value && setView(value as "all" | "action")}
                >
                  <ToggleGroupItem value="all">
                    All
                    <Count tone="neutral">{expiring.length}</Count>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="action">
                    Needs Action
                    {needsAction.length > 0 && <Count tone="neutral">{needsAction.length}</Count>}
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              <Button variant="outline" icon="cert" asChild>
                <a href={inventoryHref}>Open in Inventory</a>
              </Button>
            </>
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
            renderMenu: (cert) => {
              const blocks = certificateBlocks(cert, {
                isInventoryView: !cert.applicationName,
                caType: caType(cert)
              });
              return (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      navigate({ to: detailPath, params: { orgId, certificateId: cert.id } })
                    }
                  >
                    <Icon name="eye" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      navigator.clipboard?.writeText(cert.serialNumber);
                      toast({ tone: "neutral", title: "Serial number copied to clipboard" });
                    }}
                  >
                    <Icon name="copy" />
                    Copy serial number
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(blocks.revoke)}
                    description={blocks.revoke}
                    onSelect={() => setRevokeId(cert.id)}
                  >
                    <Icon name="x" />
                    Revoke certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(blocks.delete)}
                    description={blocks.delete}
                    onSelect={() => setDeleteId(cert.id)}
                  >
                    <Icon name="trash" />
                    Delete certificate
                  </DropdownMenuItem>
                </>
              );
            }
          }}
          empty={empty}
          persistentStatus={status}
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
