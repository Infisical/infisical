import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionPkiCertificateInstallationActions } from "@app/context/ProjectPermissionContext/types";
import {
  PkiCertificateFileFormatLabels,
  PkiInstallationLocationType,
  PkiKeystoreStatus,
  type TPkiInstallation,
  type TPkiInstallationCert,
  WindowsCertificateStoreLabels
} from "@app/hooks/api/pkiDiscovery/types";
import { getCertValidUntilBadgeDetails } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { saved } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { useCertManagerProjectId } from "../components/certificate";
import {
  canSetKeystorePassword,
  DeleteInstallationDialog,
  installationName,
  isHostFileInstallation,
  isStoreInstallation,
  KeystorePasswordDialog,
  KeystoreStatusBadge,
  passwordActionLabel,
  RESCAN_POLL_INTERVAL_MS,
  RESCAN_POLL_TIMEOUT_MS,
  storePath,
  timestamp,
  useDiscoveryAccess
} from "../DiscoveryPage/discovery-shared";

const routeId = v4Path(
  "/organizations/$orgId/cert-manager/discovery/installations/$installationId"
);

const expiryTone = { success: "ok", warning: "warn", danger: "bad" } as const;

const dash = <Muted>-</Muted>;

const detailItems = (installation: TPkiInstallation) => {
  const { locationDetails } = installation;
  const endpoint = locationDetails.fqdn || locationDetails.ipAddress;
  const isHostFile = isHostFileInstallation(installation);
  const isStore = isStoreInstallation(installation);
  const items: (readonly [string, React.ReactNode])[] = [["Name", installation.name || dash]];
  if (isStore)
    items.push(
      ["Host", locationDetails.hostname || dash],
      ["Address", locationDetails.hostIdentifier || dash],
      [
        "Certificate store",
        (locationDetails.storeName && WindowsCertificateStoreLabels[locationDetails.storeName]) ||
          locationDetails.storeName ||
          dash
      ],
      ["Path", <code key="path">{storePath(installation)}</code>],
      ["Private key", locationDetails.hasPrivateKey ? "Present" : "Not present"],
      ["Connection", installation.connection?.name || dash]
    );
  if (isHostFile) {
    items.push(
      ["Host", locationDetails.hostname || dash],
      ["Address", locationDetails.hostIdentifier || dash],
      ["Path", <code key="path">{locationDetails.filePath}</code>],
      ["Connection", installation.connection?.name || dash]
    );
    if (locationDetails.format)
      items.push(["Format", PkiCertificateFileFormatLabels[locationDetails.format]]);
  }
  if (installation.locationType === PkiInstallationLocationType.Keystore) {
    let password: React.ReactNode = <Muted>Not needed</Muted>;
    if (
      installation.metadata?.keystoreStatus === PkiKeystoreStatus.Locked ||
      installation.metadata?.keystoreStatus === PkiKeystoreStatus.PasswordFailed
    )
      password = <KeystoreStatusBadge installation={installation} />;
    else if (installation.hasKeystorePassword)
      password = (
        <Badge tone="ok" dot>
          Set
        </Badge>
      );
    items.push(["Keystore password", password]);
  }
  if (endpoint && !isHostFile && !isStore)
    items.push([
      "Endpoint",
      <code key="endpoint">{`${endpoint}${locationDetails.port ? `:${locationDetails.port}` : ""}`}</code>
    ]);
  if (locationDetails.gatewayName) items.push(["Gateway", locationDetails.gatewayName]);
  items.push(
    ["Last seen by", installation.discoveryName || dash],
    ["Last seen", timestamp(installation.lastSeenAt)],
    ["First seen", timestamp(installation.createdAt)]
  );
  return items;
};

const ExpiryStatus = ({ cert }: { cert: TPkiInstallationCert }) => {
  if (cert.deletedAt)
    return (
      <Badge tone="outline" dot>
        Deleted
      </Badge>
    );
  if (!cert.notAfter)
    return (
      <Badge tone="outline" dot>
        Unknown
      </Badge>
    );
  const { variant, label } = getCertValidUntilBadgeDetails(cert.notAfter);
  return (
    <Badge tone={expiryTone[variant]} dot>
      {label}
    </Badge>
  );
};

const InstallationDetail = ({
  orgId,
  projectId,
  installation,
  onPasswordSaved
}: {
  orgId: string;
  projectId: string;
  installation: TPkiInstallation;
  onPasswordSaved: () => void;
}) => {
  const go = useGo();
  const access = useDiscoveryAccess(projectId);
  const [settingPassword, setSettingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listHref = orgHref(orgId, "/cert-manager/discovery?selectedTab=installations");
  const keystoreStatus = installation.metadata?.keystoreStatus;
  const isPasswordSettable = canSetKeystorePassword(installation);
  const deleteBlocked = access.installations(
    ProjectPermissionPkiCertificateInstallationActions.Delete
  )
    ? undefined
    : RESTRICTED;
  const passwordBlocked = access.canRescan ? undefined : RESTRICTED;
  const isLocked =
    keystoreStatus === PkiKeystoreStatus.Locked ||
    keystoreStatus === PkiKeystoreStatus.PasswordFailed;

  const columns: DataTableColumn<TPkiInstallationCert>[] = [
    {
      id: "name",
      header: "SAN / CN",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (cert) => cert.commonName || "N/A",
      render: (cert) => (
        <RowLink
          link={go.link(orgHref(orgId, `/cert-manager/certificates/${cert.certificateId}`))}
          title={cert.commonName || "N/A"}
        >
          {cert.commonName || "N/A"}
        </RowLink>
      )
    },
    { id: "status", header: "Status", width: 160, render: (cert) => <ExpiryStatus cert={cert} /> },
    {
      id: "serial",
      header: "Serial number",
      mono: true,
      width: 200,
      text: (cert) => cert.serialNumber || "-",
      render: (cert) => cert.serialNumber || "-"
    },
    {
      id: "expires",
      header: "Expires",
      width: 120,
      render: (cert) => (cert.notAfter ? timestamp(cert.notAfter).slice(0, 12) : "-")
    },
    {
      id: "seen",
      header: "Last seen",
      width: 160,
      render: (cert) => (cert.lastSeenAt ? timestamp(cert.lastSeenAt) : "-")
    }
  ];

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Installations", link: go.link(listHref) }]}
        title={installationName(installation)}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button layout="trigger" variant="outline" icon="more">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard?.writeText(installation.id).catch(() => undefined);
                  saved("Installation ID copied");
                }}
              >
                <Icon name="copy" />
                Copy installation ID
              </DropdownMenuItem>
              {isPasswordSettable && (
                <DropdownMenuItem
                  disabled={Boolean(passwordBlocked)}
                  description={passwordBlocked}
                  onSelect={() => setSettingPassword(true)}
                >
                  <Icon name="key" />
                  {passwordActionLabel(installation)}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(deleteBlocked)}
                description={deleteBlocked}
                onSelect={() => setDeleting(true)}
              >
                <Icon name="trash" />
                Delete installation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {keystoreStatus === PkiKeystoreStatus.PasswordFailed && (
        <Alert tone="bad">
          <AlertTitle>The saved password did not open this keystore</AlertTitle>
          <AlertDescription>
            {installation.metadata?.lastError ||
              "Change the password and the file is scanned again."}
          </AlertDescription>
        </Alert>
      )}
      {keystoreStatus !== PkiKeystoreStatus.PasswordFailed && installation.metadata?.lastError && (
        <Alert tone="warn">
          <AlertTitle>The last read of this file failed</AlertTitle>
          <AlertDescription>{installation.metadata.lastError}</AlertDescription>
        </Alert>
      )}
      <DetailLayout
        asideLabel="Installation details"
        aside={
          <Card variant="framed" title="Details">
            <DataList variant="props" density="compact" items={detailItems(installation)} />
          </Card>
        }
      >
        <Card variant="framed" flush title="Discovered certificates">
          <DataTable
            label="Discovered certificates"
            rows={installation.certificates ?? []}
            columns={columns}
            getRowId={(cert) => cert.id}
            rowLabel={(cert) => cert.commonName || cert.certificateId}
            isRowMuted={(cert) => Boolean(cert.deletedAt)}
            empty={
              isLocked ? (
                <EmptyState
                  size="sm"
                  icon="lock"
                  title={
                    keystoreStatus === PkiKeystoreStatus.Locked
                      ? "This keystore needs a password before its certificates can be read"
                      : "The certificates in this keystore can be read once the right password is saved"
                  }
                  actions={
                    <Button
                      variant="outline"
                      icon="key"
                      disabledReason={passwordBlocked}
                      onClick={() => setSettingPassword(true)}
                    >
                      {passwordActionLabel(installation)}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  size="sm"
                  icon="cert"
                  title="No certificates found on this installation"
                  description="Run a scan to find certificates."
                />
              )
            }
          />
        </Card>
      </DetailLayout>
      <KeystorePasswordDialog
        installation={settingPassword ? installation : undefined}
        projectId={projectId}
        onClose={() => setSettingPassword(false)}
        onSaved={onPasswordSaved}
      />
      <DeleteInstallationDialog
        installation={deleting ? installation : undefined}
        projectId={projectId}
        onClose={() => setDeleting(false)}
        onDeleted={() => go(listHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, installationId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const access = useDiscoveryAccess(projectId ?? "");
  const [pendingRescan, setPendingRescan] = useState<{
    previousCheckedAt?: string;
    startedAt: number;
  } | null>(null);
  const { data: installation, isPending } = useV4Adapter("pkiDiscovery").useInstallation(
    { installationId },
    {
      refetchInterval: (current) =>
        pendingRescan &&
        current?.metadata?.lastCheckedAt === pendingRescan.previousCheckedAt &&
        Date.now() - pendingRescan.startedAt < RESCAN_POLL_TIMEOUT_MS
          ? RESCAN_POLL_INTERVAL_MS
          : false
    }
  );
  if (isResolving || access.isPending || isPending)
    return <Loader size="page" label="Loading installation" />;
  if (!access.installations(ProjectPermissionPkiCertificateInstallationActions.Read))
    return <AccessRestricted requirement="Read certificate installations" />;
  if (!installation || !projectId)
    return (
      <EmptyState
        icon="server"
        title="Installation not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/discovery?selectedTab=installations")}>
              Back to installations
            </a>
          </Button>
        }
      />
    );
  return (
    <InstallationDetail
      orgId={orgId}
      projectId={projectId}
      installation={installation}
      onPasswordSaved={() =>
        setPendingRescan({
          previousCheckedAt: installation.metadata?.lastCheckedAt,
          startedAt: Date.now()
        })
      }
    />
  );
};

export const InstallationDetailsByIDPage = () => (
  <TooltipProvider>
    <PageTitle title="Installation Details" />
    <Page />
  </TooltipProvider>
);
