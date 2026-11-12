import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Grid } from "@infisical/cipher/ui/layout";
import { type DataListItem, DataList, List, ListRow } from "@infisical/cipher/ui/list";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import type { TApprovalRequest } from "@app/hooks/api/approvalRequests/types";
import {
  certKeyAlgorithmToNameMap,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import type { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import {
  CodeSigningScopeField,
  codeSigningScopeFieldLabels,
  MONOSPACED_SCOPE_FIELDS
} from "@app/hooks/api/signers/types";

import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import { certDataOf, signingDataOf } from "../components/approval";

const unitNames: Record<string, [string, string]> = {
  d: ["day", "days"],
  h: ["hour", "hours"],
  m: ["minute", "minutes"],
  y: ["year", "years"]
};

export const formatValidity = (ttl: string) => {
  const match = ttl.match(/^(\d+)([dhmy])$/i);
  if (!match) return ttl;
  const value = parseInt(match[1], 10);
  const names = unitNames[match[2].toLowerCase()];
  return `${value} ${value === 1 ? names[0] : names[1]}`;
};

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

const present = (items: (DataListItem | false | undefined)[]) =>
  items.filter((item): item is DataListItem => Boolean(item));

export const CertificateSections = ({
  orgId,
  request
}: {
  orgId: string;
  request: TApprovalRequest;
}) => {
  const approvals = useV4Adapter("approvalRequests");
  const data = certDataOf(request);
  const certRequest = data?.certificateRequest;
  const { data: profile, isPending: profilePending } = approvals.useProfile(data?.profileId ?? "");
  const { data: details } = approvals.useCertificateRequest(data?.certificateRequestId ?? "");
  const ca = profile?.certificateAuthority;
  const organization = details?.organization || certRequest?.organization;
  const organizationalUnit = details?.organizationalUnit || certRequest?.organizationalUnit;
  const country = details?.country || certRequest?.country;
  const state = details?.state || certRequest?.state;
  const locality = details?.locality || certRequest?.locality;
  const domainComponents = details?.domainComponents || certRequest?.domainComponents || [];
  const basicConstraints = details?.basicConstraints || certRequest?.basicConstraints;
  const metadata = details?.metadata ?? [];
  const extensions = details?.customExtensions ?? [];
  const altNames = (certRequest?.altNames ?? []).filter(
    (san) => san.value !== certRequest?.commonName
  );
  const keyUsages = certRequest?.keyUsages ?? [];
  const extendedKeyUsages = certRequest?.extendedKeyUsages ?? [];
  const caValue = () => {
    if (profilePending) return <Skeleton key="ca" width={120} />;
    if (ca && !ca.isExternal)
      return (
        <Button key="ca" variant="link" asChild>
          <a href={orgHref(orgId, `/cert-manager/ca/${ca.id}`)}>{ca.name}</a>
        </Button>
      );
    return ca?.name ?? "None";
  };
  const subject = present([
    Boolean(certRequest?.commonName) && ["Common name (CN)", certRequest?.commonName],
    Boolean(organization) && ["Organization (O)", organization, { span: "half" }],
    Boolean(organizationalUnit) && [
      "Organizational unit (OU)",
      organizationalUnit,
      { span: "half" }
    ],
    Boolean(country) && ["Country (C)", country, { span: "half" }],
    Boolean(state) && ["State (ST)", state, { span: "half" }],
    Boolean(locality) && ["Locality (L)", locality],
    domainComponents.length > 0 && [
      "Domain components (DC)",
      <code key="dc">{domainComponents.join(", ")}</code>
    ]
  ]);
  return (
    <>
      <Grid min="card" gap={24} style={{ alignItems: "start" }}>
        <Card variant="framed" title="Certificate">
          <DataList
            variant="props"
            density="compact"
            items={present([
              Boolean(certRequest?.keyAlgorithm) && [
                "Key algorithm",
                certKeyAlgorithmToNameMap[certRequest?.keyAlgorithm as CertKeyAlgorithm] ??
                  certRequest?.keyAlgorithm,
                { span: "half" }
              ],
              Boolean(certRequest?.signatureAlgorithm) && [
                "Signature algorithm",
                certRequest?.signatureAlgorithm,
                { span: "half" }
              ],
              Boolean(certRequest?.validity?.ttl) && [
                "Validity",
                formatValidity(certRequest?.validity?.ttl ?? "")
              ],
              ["Certificate authority", caValue()],
              ["Certificate profile", data?.profileName],
              basicConstraints?.isCA && [
                "Basic constraints",
                "Certificate authority",
                { span: "half" }
              ],
              basicConstraints?.isCA &&
                basicConstraints.pathLength !== undefined && [
                  "Path length",
                  String(basicConstraints.pathLength),
                  { span: "half" }
                ]
            ])}
          />
        </Card>
        <Card variant="framed" title="Subject">
          {subject.length ? (
            <DataList variant="props" density="compact" items={subject} />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="user"
              title="No subject information specified"
            />
          )}
        </Card>
      </Grid>
      {altNames.length > 0 && (
        <List label="Subject alternative names" title="Subject alternative names" size="sm">
          {altNames.map((san) => (
            <ListRow
              key={`${san.type}-${san.value}`}
              value={`${san.type}-${san.value}`}
              label={san.value}
              title={<code>{san.value}</code>}
            />
          ))}
        </List>
      )}
      {(keyUsages.length > 0 || extendedKeyUsages.length > 0) && (
        <Card variant="framed" title="Key usage">
          <DataList
            variant="props"
            density="compact"
            items={present([
              keyUsages.length > 0 && [
                "Key usage",
                keyUsages.map((usage) => labelOf(KEY_USAGES_OPTIONS, usage)).join(", ")
              ],
              extendedKeyUsages.length > 0 && [
                "Extended key usage",
                extendedKeyUsages
                  .map((usage) => labelOf(EXTENDED_KEY_USAGES_OPTIONS, usage))
                  .join(", ")
              ]
            ])}
          />
        </Card>
      )}
      {extensions.length > 0 && (
        <List label="Custom extensions" title="Custom extensions" size="sm">
          {extensions.map((extension) => (
            <ListRow
              key={extension.oid}
              value={extension.oid}
              label={extension.oid}
              title={<code>{extension.oid}</code>}
              description={extension.displayValue ?? extension.value}
              badge={extension.critical ? <Badge tone="warn">Critical</Badge> : undefined}
            />
          ))}
        </List>
      )}
      <List
        label="Metadata"
        title="Metadata"
        size="sm"
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="file"
            title="No metadata attached to this request"
          />
        }
      >
        {metadata.map((item) => (
          <ListRow
            key={`${item.key}=${item.value}`}
            value={`${item.key}=${item.value}`}
            label={item.key}
            title={<code>{item.key}</code>}
            meta={item.value ? <code>{item.value}</code> : undefined}
          />
        ))}
      </List>
    </>
  );
};

export const SigningScopeCard = ({ request }: { request: TApprovalRequest }) => {
  const scope = signingDataOf(request)?.scope;
  const fields = Object.values(CodeSigningScopeField).filter((field) => scope?.[field]);
  if (!fields.length) return null;
  return (
    <Card
      variant="framed"
      title="Request scope"
      description="Signing is only allowed when every parameter below matches exactly."
    >
      <DataList
        variant="props"
        density="compact"
        items={fields.map((field) => [
          codeSigningScopeFieldLabels[field],
          MONOSPACED_SCOPE_FIELDS.includes(field) ? (
            <code key={field}>{scope?.[field]}</code>
          ) : (
            scope?.[field]
          )
        ])}
      />
    </Card>
  );
};
