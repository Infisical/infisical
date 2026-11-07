import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { DetailLayout, Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import {
  certKeyAlgorithmToNameMap,
  certSignatureAlgorithmToNameMap,
  EXTENDED_KEY_USAGE_LABELS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm, CertKeyUsage, CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import type { TPkiInstallation } from "@app/hooks/api/pkiDiscovery/types";
import {
  getCertificateDisplayStatus,
  getCertSourceLabel
} from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { useV4Adapter } from "../../data/adapters";
import {
  altNamesOf,
  certificateBlocks,
  certificateName,
  CertificateStatusBadge,
  daysLeft,
  DeleteCertificateDialog,
  ExpiryBadge,
  RevokeCertificateDialog,
  shortDate,
  useCertManagerProjectId
} from "../components/certificate";

const routeId = "/v4/organizations/$orgId/cert-manager/certificates/$certificateId";

const ledeOf = (cert: TCertificate) => {
  const left = daysLeft(cert.notAfter);
  const { status } = getCertificateDisplayStatus(cert);
  if (status === CertStatus.DELETED) return "Deleted. It no longer serves or renews.";
  if (status === CertStatus.REVOKED) return "Revoked. Clients that check revocation reject it.";
  if (status === CertStatus.EXPIRED)
    return `Expired ${-left} days ago. Issue a replacement, then delete this one.`;
  if (status === CertStatus.RENEWED) return "Renewed. A newer certificate replaces this one.";
  if (left > 30) return `Valid for ${left} more days.`;
  return cert.renewBeforeDays
    ? `Expires in ${left} days. Auto renewal runs ${cert.renewBeforeDays} days before expiry.`
    : `Expires in ${left} days, and auto renewal is off.`;
};

const keyUsageLabel = Object.fromEntries(
  KEY_USAGES_OPTIONS.map(({ value, label }) => [value, label])
) as Record<CertKeyUsage, string>;

const listOf = <T extends string>(values: T[] | undefined, names: Record<T, string>) =>
  values?.length ? values.map((value) => names[value] ?? value).join(", ") : "None";

const algorithmLabel = (algorithm?: string | null) =>
  (algorithm && certKeyAlgorithmToNameMap[algorithm as CertKeyAlgorithm]) || algorithm || "None";

const chainOf = (cert: TCertificate, authorities: TUnifiedCertificateAuthority[]) => {
  const chain: TUnifiedCertificateAuthority[] = [];
  let next = authorities.find((ca) => ca.id === cert.caId);
  while (next && !chain.includes(next)) {
    chain.push(next);
    const parentId = next.type === CaType.INTERNAL ? next.configuration.parentCaId : undefined;
    next = parentId ? authorities.find((ca) => ca.id === parentId) : undefined;
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

const CertificateDetail = ({
  cert,
  orgId,
  projectId,
  fromApplication,
  fromHsmConnector
}: {
  cert: TCertificate;
  orgId: string;
  projectId: string;
  fromApplication?: string;
  fromHsmConnector?: string;
}) => {
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const { data: authorities = [] } = certificates.useCertificateAuthorities();
  const { data: installations, isPending: installationsPending } = certificates.useInstallations({
    projectId,
    certificateId: cert.id
  });
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const org = `/v4/organizations/${orgId}/cert-manager`;
  const parentApplication = cert.applicationName ?? fromApplication;
  const caType = authorities.find((ca) => ca.id === cert.caId)?.type;
  const blocks = certificateBlocks(cert, {
    isInventoryView: !parentApplication,
    caType
  });
  const backCrumb = () => {
    if (parentApplication)
      return {
        label: parentApplication,
        href: `${org}/applications/${parentApplication}?selectedTab=certificates`
      };
    if (fromHsmConnector)
      return {
        label: "HSM connector",
        href: `${org}/hsm-connectors/${fromHsmConnector}`
      };
    return { label: "Inventory", href: `${org}/inventory` };
  };
  const name = certificateName(cert);
  const sans = altNamesOf(cert);
  const chain = chainOf(cert, authorities);
  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[backCrumb()]}
        title={name}
        badges={<CertificateStatusBadge cert={cert} />}
        description={ledeOf(cert)}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon="more" iconRight="chev-down">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={Boolean(blocks.renew)} description={blocks.renew}>
                  <Icon name="sync" />
                  Renew now
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(blocks.autoRenew)}
                  description={blocks.autoRenew}
                >
                  <Icon name="clock" />
                  {cert.renewBeforeDays ? "Manage auto renewal" : "Enable auto renewal"}
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
                  onSelect={() => setRevoking(true)}
                >
                  <Icon name="x" />
                  Revoke certificate
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(blocks.delete)}
                  description={blocks.delete}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete certificate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="primary"
                  icon="download"
                  iconRight="chev-down"
                  disabled={Boolean(blocks.export)}
                >
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Certificate (PEM)</DropdownMenuItem>
                <DropdownMenuItem>Certificate and chain (PEM)</DropdownMenuItem>
                <DropdownMenuItem>PKCS#12 bundle</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <DetailLayout
        asideLabel="Certificate details"
        aside={
          <>
            <Card variant="framed" title="Overview">
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Common name", cert.commonName || "None"],
                  ["Serial number", <code key="serial">{cert.serialNumber}</code>],
                  ["Status", <CertificateStatusBadge key="status" cert={cert} />, { span: "half" }],
                  ["Source", getCertSourceLabel(cert.source ?? null), { span: "half" }],
                  ["Not before", shortDate(cert.notBefore), { span: "half" }],
                  [
                    "Not after",
                    <Inline key="after" gap={8} align="center" wrap>
                      {shortDate(cert.notAfter)}
                      <ExpiryBadge cert={cert} />
                    </Inline>,
                    { span: "half" }
                  ],
                  ...(cert.fingerprints?.sha256
                    ? [
                        [
                          "SHA-256 fingerprint",
                          <code key="sha256">{cert.fingerprints.sha256}</code>
                        ] as const
                      ]
                    : [])
                ]}
              />
            </Card>
            <Card variant="framed" title="Issuance">
              <DataList
                variant="props"
                density="compact"
                items={[
                  [
                    "Certificate authority",
                    cert.caId ? (
                      <Button key="ca" variant="link" asChild>
                        <a href={`${org}/ca/${cert.caId}`}>{cert.caName ?? cert.caId}</a>
                      </Button>
                    ) : (
                      "None"
                    )
                  ],
                  [
                    "Profile",
                    cert.profileName ? <code key="profile">{cert.profileName}</code> : "None"
                  ],
                  ["Application", cert.applicationName ?? "None"],
                  ["Enrollment", cert.enrollmentType?.toUpperCase() ?? "None"],
                  [
                    "Auto renewal",
                    cert.renewBeforeDays ? `${cert.renewBeforeDays} days before expiry` : "Off"
                  ]
                ]}
              />
            </Card>
          </>
        }
      >
        <Grid min="card" gap={24} style={{ alignItems: "start" }}>
          <Card variant="framed" title="Subject">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Common name", cert.subject?.commonName || cert.commonName || "None"],
                ["Organization", cert.subject?.organization || "None", { span: "half" }],
                [
                  "Organizational unit",
                  cert.subject?.organizationalUnit || "None",
                  { span: "half" }
                ],
                ["Locality", cert.subject?.locality || "None", { span: "half" }],
                ["State", cert.subject?.state || "None", { span: "half" }],
                ["Country", cert.subject?.country || "None"]
              ]}
            />
          </Card>
          <Card variant="framed" title="Key usage">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Key usage", listOf(cert.keyUsages, keyUsageLabel)],
                ["Extended key usage", listOf(cert.extendedKeyUsages, EXTENDED_KEY_USAGE_LABELS)],
                [
                  "Basic constraints",
                  cert.basicConstraints?.isCA ? "Certificate authority" : "Not a CA"
                ],
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
            <EmptyState
              size="sm"
              media="bare"
              icon="cert"
              title="No subject alternative names"
              description="This certificate identifies by common name only."
            />
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
              media={<Icon name="machine" />}
              title={host.name ?? endpointOf(host)}
              description={[endpointOf(host), host.locationDetails.gatewayName]
                .filter(Boolean)
                .join(", ")}
              meta={`Seen ${formatDistanceToNow(new Date(host.lastSeenAt), { addSuffix: true })}`}
              href={`${org}/discovery/installations/${host.id}`}
            />
          ))}
        </List>
      </DetailLayout>
      <RevokeCertificateDialog
        cert={revoking ? cert : undefined}
        onClose={() => setRevoking(false)}
      />
      <DeleteCertificateDialog
        cert={deleting ? cert : undefined}
        caType={caType}
        onClose={() => setDeleting(false)}
        onDeleted={() =>
          navigate({
            to: "/v4/organizations/$orgId/cert-manager/inventory",
            params: { orgId }
          })
        }
      />
    </Stack>
  );
};

export const CertificateDetailsByIDPage = () => {
  const { orgId, certificateId } = useParams({ from: routeId });
  const { fromApplication, fromHsmConnector } = useSearch({ from: routeId });
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
            <a href={`/v4/organizations/${orgId}/cert-manager/inventory`}>Back to inventory</a>
          </Button>
        }
      />
    );
  return (
    <CertificateDetail
      cert={data.certificate}
      orgId={orgId}
      projectId={projectId}
      fromApplication={fromApplication}
      fromHsmConnector={fromHsmConnector}
    />
  );
};
