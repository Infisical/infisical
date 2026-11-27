import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem, List, ListRow } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import { CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import {
  certKeyAlgorithmToNameMap,
  certSignatureAlgorithmToNameMap,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import type { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import type { TPkiInstallation } from "@app/hooks/api/pkiDiscovery/types";
import { camelCaseToSpaces, toTitleCase } from "@app/lib/fn/string";
import { getCertSourceLabel } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { certificateHref, orgHref, useGo } from "../../links";
import { TruncatedValue } from "../../networking/truncated-value";
import {
  altNamesOf,
  certificateBlocks,
  certificateName,
  CertificateStatusBadge,
  DeleteCertificateDialog,
  ExpiryBadge,
  RevokeCertificateDialog,
  shortDate,
  type CertificateRevocation,
  useCertificateReasons,
  useCertManagerProjectId,
  useRevocationApprovals
} from "../components/certificate";
import {
  ExportCertificateDialog,
  useExportCertificate,
  usePkcs12Block
} from "../components/certificate-export";
import { exportFormatLabel } from "../components/certificate-export-format";
import { CertificatePartsDialog } from "../components/certificate-parts-dialog";
import { AutoRenewalDialog } from "../components/certificate-requests/auto-renewal-dialog";
import { RenewCertificateSheet } from "../components/certificate-requests/renew-sheet";
import { CertificateMetadataCard } from "./certificate-metadata";
import { CertificateSyncsDialog } from "./certificate-syncs";

const usageKey = (usage: string) => usage.replace(/_/g, "").toLowerCase();

const usageLabels: Record<string, string> = Object.fromEntries(
  [...KEY_USAGES_OPTIONS, ...EXTENDED_KEY_USAGES_OPTIONS].map(({ value, label }) => [
    usageKey(value),
    label
  ])
);

const usagesOf = (usages?: string[]) =>
  usages?.length
    ? usages
        .map(
          (usage) =>
            usageLabels[usageKey(usage)] ?? toTitleCase(camelCaseToSpaces(usage).replace(/_/g, " "))
        )
        .join(", ")
    : "None";

const algorithmLabel = (algorithm?: string | null) =>
  (algorithm && certKeyAlgorithmToNameMap[algorithm as CertKeyAlgorithm]) || algorithm || "None";

const chainOf = (cert: TCertificate, authorities: TUnifiedCertificateAuthority[]) => {
  const byId = new Map(authorities.map((ca) => [ca.id, ca]));
  const chain: TUnifiedCertificateAuthority[] = [];
  const seen = new Set<string>();
  let next = byId.get(cert.caId);
  while (next && !seen.has(next.id)) {
    chain.push(next);
    seen.add(next.id);
    const parentId = next.type === CaType.INTERNAL ? next.configuration.parentCaId : undefined;
    next = parentId ? byId.get(parentId) : undefined;
  }
  return chain;
};

const caMeta = (ca: TUnifiedCertificateAuthority) => {
  if (ca.type !== CaType.INTERNAL) return "External certificate authority";
  const role = ca.configuration.type === InternalCaType.ROOT ? "Root" : "Intermediate";
  return ca.configuration.notAfter
    ? `${role}, expires ${shortDate(ca.configuration.notAfter)}`
    : role;
};

const endpointOf = ({ locationDetails: details }: TPkiInstallation) => {
  const host = details.fqdn ?? details.ipAddress ?? details.hostname ?? details.filePath ?? "";
  return details.port ? `${host}:${details.port}` : host;
};

const LinkedCertificate = ({
  orgId,
  certificateId,
  applicationName
}: {
  orgId: string;
  certificateId: string;
  applicationName?: string;
}) => {
  const { data } = useV4Adapter("certificates").useCertificate(certificateId);
  return (
    <Button variant="link" asChild>
      <a href={certificateHref(orgId, certificateId, { applicationName })}>
        {data?.certificate ? certificateName(data.certificate) : certificateId}
      </a>
    </Button>
  );
};

const DownloadMenu = ({
  cert,
  projectId,
  block
}: {
  cert: TCertificate;
  projectId: string;
  block?: string;
}) => {
  const [exportingPkcs12, setExportingPkcs12] = useState(false);
  const exporter = useExportCertificate();
  const pkcs12Block = usePkcs12Block(cert, projectId);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            layout="trigger"
            variant="primary"
            icon="download"
            loading={exporter.isPending}
            disabledReason={block}
          >
            Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => exporter.download(cert, "pem")}>
            {exportFormatLabel.pem}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exporter.download(cert, "chain")}>
            {exportFormatLabel.chain}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabledReason={pkcs12Block}
            onSelect={() => exporter.download(cert, "key")}
          >
            {exportFormatLabel.key}
          </DropdownMenuItem>
          <DropdownMenuItem disabledReason={pkcs12Block} onSelect={() => setExportingPkcs12(true)}>
            {exportFormatLabel.pkcs12}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportCertificateDialog
        cert={exportingPkcs12 ? cert : undefined}
        projectId={projectId}
        initialFormat="pkcs12"
        onClose={() => setExportingPkcs12(false)}
      />
    </>
  );
};

const applicationHref = (orgId: string, applicationName: string) =>
  orgHref(
    orgId,
    `/cert-manager/applications/${encodeURIComponent(applicationName)}?selectedTab=certificates`
  );

const backCrumbOf = (orgId: string, applicationName?: string, fromHsmConnector?: string) => {
  const org = orgHref(orgId, "/cert-manager");
  if (applicationName)
    return { label: applicationName, href: applicationHref(orgId, applicationName) };
  if (fromHsmConnector)
    return { label: "HSM connector", href: `${org}/hsm-connectors/${fromHsmConnector}` };
  return { label: "Inventory", href: `${org}/inventory` };
};

const when = (condition: unknown, item: DataListItem): DataListItem[] => (condition ? [item] : []);

const overviewItems = (
  cert: TCertificate,
  orgId: string,
  applicationName?: string
): DataListItem[] => [
  ["Common name", cert.commonName || "None"],
  [
    "Serial number",
    <TruncatedValue
      key="serial"
      value={cert.serialNumber}
      copyLabel="Copy serial number to clipboard"
    />
  ],
  ...when(cert.orderId, [
    "Order ID",
    <TruncatedValue key="order" value={cert.orderId ?? ""} copyLabel="Copy order ID to clipboard" />
  ]),
  ["Status", <CertificateStatusBadge key="status" cert={cert} />],
  ["Source", getCertSourceLabel(cert.source ?? null)],
  ["Not before", shortDate(cert.notBefore)],
  [
    "Not after",
    <Inline key="after" gap={8} align="center" wrap>
      {shortDate(cert.notAfter)}
      <ExpiryBadge cert={cert} />
    </Inline>
  ],
  ...when(cert.fingerprints?.sha256, [
    "SHA-256 fingerprint",
    <TruncatedValue
      key="sha256"
      value={cert.fingerprints?.sha256 ?? ""}
      copyLabel="Copy SHA-256 fingerprint to clipboard"
    />
  ]),
  ...when(cert.renewedFromCertificateId, [
    "Renewed from",
    <LinkedCertificate
      key="renewed-from"
      orgId={orgId}
      certificateId={cert.renewedFromCertificateId ?? ""}
      applicationName={applicationName}
    />
  ]),
  ...when(cert.renewedByCertificateId, [
    "Renewed by",
    <LinkedCertificate
      key="renewed-by"
      orgId={orgId}
      certificateId={cert.renewedByCertificateId ?? ""}
      applicationName={applicationName}
    />
  ])
];

const issuerOf = (cert: TCertificate, org: string) =>
  cert.caId ? (
    <Button key="ca" variant="link" asChild>
      <a href={`${org}/ca/${cert.caId}`}>{cert.caName ?? cert.caId}</a>
    </Button>
  ) : (
    cert.discoveryMetadata?.issuerCommonName || "None"
  );

const issuanceItems = (cert: TCertificate, org: string): DataListItem[] => [
  ["Certificate authority", issuerOf(cert, org)],
  ...when(!cert.caId && cert.discoveryMetadata?.issuerOrganization, [
    "Issuer organization",
    cert.discoveryMetadata?.issuerOrganization
  ]),
  ["Profile", cert.profileName ? <code key="profile">{cert.profileName}</code> : "None"],
  ["Application", cert.applicationName ?? "None"],
  ["Auto renewal", cert.renewBeforeDays ? `${cert.renewBeforeDays} days before expiry` : "Off"]
];

const CertificateAside = ({
  cert,
  orgId,
  applicationName
}: {
  cert: TCertificate;
  orgId: string;
  applicationName?: string;
}) => (
  <Card variant="framed" title="Details">
    <DataList
      variant="props"
      density="compact"
      items={[
        ...overviewItems(cert, orgId, applicationName),
        ...issuanceItems(cert, orgHref(orgId, "/cert-manager"))
      ]}
    />
  </Card>
);

const CertificateActionsMenu = ({
  cert,
  orgId,
  projectId,
  caType,
  blocks,
  revocation,
  applicationName
}: {
  cert: TCertificate;
  orgId: string;
  projectId: string;
  caType?: CaType;
  blocks: ReturnType<typeof certificateBlocks>;
  revocation: CertificateRevocation;
  applicationName?: string;
}) => {
  const go = useGo();
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [managingRenewal, setManagingRenewal] = useState(false);
  const [managingSyncs, setManagingSyncs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const updateRenewal = useV4Adapter("certificates").useUpdateRenewalConfig();
  const {
    canDelete,
    editReason,
    renewReason,
    autoRenewReason,
    syncReason,
    revokeReason,
    deleteReason
  } = useCertificateReasons(cert, projectId, blocks, revocation);
  const isAutoRenewalEnabled = Boolean(cert.renewBeforeDays && cert.renewBeforeDays > 0);
  const disableAutoRenewal = async () => {
    try {
      await updateRenewal.mutateAsync({ certificateId: cert.id, enableAutoRenewal: false });
      saved(`Auto renewal disabled for ${certificateName(cert)}`);
    } catch (error) {
      failed("Failed to disable auto renewal", error);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button layout="trigger" variant="outline" icon="more">
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={Boolean(blocks.export)}
            description={blocks.export}
            onSelect={() => setExporting(true)}
          >
            <Icon name="copy" />
            Export certificate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={Boolean(renewReason)}
            description={renewReason}
            onSelect={() => setRenewing(true)}
          >
            <Icon name="sync" />
            Renew now
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(autoRenewReason)}
            description={autoRenewReason}
            onSelect={() => setManagingRenewal(true)}
          >
            <Icon name="clock" />
            {isAutoRenewalEnabled ? "Manage auto renewal" : "Enable auto renewal"}
          </DropdownMenuItem>
          {isAutoRenewalEnabled && !blocks.autoRenew && (
            <DropdownMenuItem
              disabled={Boolean(editReason)}
              description={editReason}
              onSelect={disableAutoRenewal}
            >
              <Icon name="x" />
              Disable auto renewal
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={Boolean(syncReason)}
            description={syncReason}
            onSelect={() => setManagingSyncs(true)}
          >
            <Icon name="link" />
            Manage certificate syncs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={Boolean(revokeReason)}
            description={revokeReason ?? revocation.revokeReplacesRequestReason}
            onSelect={() => setRevoking(true)}
          >
            <Icon name="x" />
            {revocation.isRevocationApprovalRequired ? "Request revocation" : "Revoke certificate"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={Boolean(deleteReason)}
            description={deleteReason}
            onSelect={() => setDeleting(true)}
          >
            <Icon name="trash" />
            Delete certificate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CertificatePartsDialog
        cert={exporting ? cert : undefined}
        projectId={projectId}
        onClose={() => setExporting(false)}
      />
      {renewing && (
        <RenewCertificateSheet
          cert={cert}
          applicationName={applicationName}
          canRevoke={canDelete}
          onClose={() => setRenewing(false)}
        />
      )}
      <AutoRenewalDialog
        cert={managingRenewal ? cert : undefined}
        onClose={() => setManagingRenewal(false)}
      />
      <CertificateSyncsDialog
        open={managingSyncs}
        onOpenChange={setManagingSyncs}
        certificate={cert}
        projectId={projectId}
      />
      <RevokeCertificateDialog
        cert={revoking ? cert : undefined}
        isRevocationApprovalRequired={revocation.isRevocationApprovalRequired}
        onClose={() => setRevoking(false)}
      />
      <DeleteCertificateDialog
        cert={deleting ? cert : undefined}
        caType={caType}
        projectId={projectId}
        onClose={() => setDeleting(false)}
        onDeleted={() =>
          go(
            applicationName
              ? applicationHref(orgId, applicationName)
              : orgHref(orgId, "/cert-manager/inventory")
          )
        }
      />
    </>
  );
};

const CertificateDetail = ({
  cert,
  orgId,
  projectId,
  applicationName,
  fromHsmConnector
}: {
  cert: TCertificate;
  orgId: string;
  projectId: string;
  applicationName?: string;
  fromHsmConnector?: string;
}) => {
  const certificates = useV4Adapter("certificates");
  const { data: authorities = [] } = certificates.useCertificateAuthorities();
  const { data: installations, isPending: installationsPending } = certificates.useInstallations({
    projectId,
    certificateId: cert.id
  });
  const org = orgHref(orgId, "/cert-manager");
  const parentApplication = applicationName ?? cert.applicationName;
  const caType = authorities.find((ca) => ca.id === cert.caId)?.type;
  const revocation = useRevocationApprovals(cert.applicationId)(cert);
  const blocks = certificateBlocks(cert, {
    isInventoryView: !parentApplication,
    caType,
    revocation
  });
  const { metadataReason } = useCertificateReasons(cert, projectId, blocks, revocation);
  const name = certificateName(cert);
  const sans = altNamesOf(cert);
  const chain = chainOf(cert, authorities);
  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[backCrumbOf(orgId, applicationName, fromHsmConnector)]}
        title={name}
        badges={<CertificateStatusBadge cert={cert} revocation={revocation} size="control-sm" />}
        actions={
          <>
            <CertificateActionsMenu
              cert={cert}
              orgId={orgId}
              projectId={projectId}
              caType={caType}
              blocks={blocks}
              revocation={revocation}
              applicationName={applicationName}
            />
            <DownloadMenu cert={cert} projectId={projectId} block={blocks.export} />
          </>
        }
      />
      <DetailLayout
        asideLabel="Certificate details"
        aside={<CertificateAside cert={cert} orgId={orgId} applicationName={applicationName} />}
      >
        {revocation.isPending && revocation.requestId && (
          <Alert tone="warn">
            {"This certificate isn't revoked until its "}
            <Button variant="link" asChild>
              <a
                href={orgHref(
                  orgId,
                  `/cert-manager/approvals/${revocation.requestId}?policyType=${ApprovalPolicyType.CertRevocation}&${applicationName ? `applicationName=${encodeURIComponent(applicationName)}` : "from=root-requests"}`
                )}
              >
                revocation request
              </a>
            </Button>
            {" is approved."}
            {revocation.revokeReplacesRequestReason && ` ${revocation.revokeReplacesRequestReason}`}
          </Alert>
        )}
        <Grid min="card" gap={24} style={{ alignItems: "start" }}>
          <Card variant="framed" title="Subject">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Common name", cert.subject?.commonName || cert.commonName || "None"],
                ["Organization", cert.subject?.organization || "None"],
                ["Organizational unit", cert.subject?.organizationalUnit || "None"],
                ["Locality", cert.subject?.locality || "None"],
                ["State", cert.subject?.state || "None"],
                ["Country", cert.subject?.country || "None"]
              ]}
            />
          </Card>
          <Card variant="framed" title="Extensions">
            <DataList
              variant="props"
              density="compact"
              items={[
                [
                  "Basic constraints",
                  cert.basicConstraints?.isCA ? "Certificate authority" : "Not a CA"
                ],
                ["Path length", cert.basicConstraints?.pathLength ?? "None"],
                ["Key usage", usagesOf(cert.keyUsages)],
                ["Extended key usage", usagesOf(cert.extendedKeyUsages)],
                ["Key algorithm", algorithmLabel(cert.keyAlgorithm)],
                [
                  "Signature algorithm",
                  (cert.signatureAlgorithm &&
                    certSignatureAlgorithmToNameMap[cert.signatureAlgorithm]) ||
                    cert.signatureAlgorithm ||
                    "None"
                ]
              ]}
            />
          </Card>
        </Grid>
        <List
          label="Subject alternative names"
          title="Subject alternative names"
          size="sm"
          empty={
            <EmptyState size="sm" media="bare" icon="cert" title="No subject alternative names" />
          }
        >
          {sans.map((san) => (
            <ListRow key={san} value={san} label={san} title={<code>{san}</code>} meta="DNS name" />
          ))}
        </List>
        <List label="Certificate chain" title="Certificate chain" size="sm">
          <ListRow
            value="leaf"
            label={name}
            media={<Icon name="cert" />}
            title={name}
            meta="This certificate"
          />
          {chain.map((ca) => (
            <ListRow
              key={ca.id}
              value={ca.id}
              label={ca.name}
              media={<Icon name="building" />}
              title={ca.name}
              meta={caMeta(ca)}
              href={`${org}/ca/${ca.id}`}
            />
          ))}
        </List>
        <List
          label="Installations"
          title="Installations"
          size="sm"
          loading={installationsPending}
          loadingRows={2}
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="Not found on any host yet"
              description="Discovery scans list the hosts that serve this certificate."
            />
          }
        >
          {(installations?.installations ?? []).map((host) => (
            <ListRow
              key={host.id}
              value={host.id}
              label={host.name ?? endpointOf(host)}
              media={<Icon name="server" />}
              title={host.name ?? endpointOf(host)}
              description={[endpointOf(host), host.locationDetails.gatewayName]
                .filter(Boolean)
                .join(", ")}
              meta={`Seen ${formatDistanceToNow(new Date(host.lastSeenAt), { addSuffix: true })}`}
              href={`${org}/discovery/installations/${host.id}`}
            />
          ))}
        </List>
        <CertificateMetadataCard cert={cert} editReason={metadataReason} />
      </DetailLayout>
    </Stack>
  );
};

export const CertificateDetailsByIDPage = () => {
  const { orgId, certificateId, applicationName } = useParams({ strict: false }) as {
    orgId: string;
    certificateId: string;
    applicationName?: string;
  };
  const { fromHsmConnector } = useSearch({ strict: false });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { data, isPending } = useV4Adapter("certificates").useCertificate(certificateId);
  if (isResolving || isPending) return <Loader size="page" label="Loading certificate" />;
  if (!data?.certificate || !projectId)
    return (
      <EmptyState
        icon="cert"
        title="Certificate not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            {applicationName ? (
              <a href={applicationHref(orgId, applicationName)}>Back to {applicationName}</a>
            ) : (
              <a href={orgHref(orgId, "/cert-manager/inventory")}>Back to inventory</a>
            )}
          </Button>
        }
      />
    );
  return (
    <CertificateDetail
      cert={data.certificate}
      orgId={orgId}
      projectId={projectId}
      applicationName={applicationName}
      fromHsmConnector={fromHsmConnector}
    />
  );
};
