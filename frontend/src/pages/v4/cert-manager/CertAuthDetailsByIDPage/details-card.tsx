import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataList } from "@infisical/cipher/ui/list";

import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { CaStatus, InternalCaType } from "@app/hooks/api/ca/enums";
import type { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { CaStatusBadge } from "../CertificateAuthoritiesPage/shared";

type Configuration = TInternalCertificateAuthority["configuration"];

const KEY_SOURCE_LABELS: Record<CertKeySource, string> = {
  [CertKeySource.Infisical]: "Infisical",
  [CertKeySource.Hsm]: "HSM",
  [CertKeySource.AwsKms]: "AWS KMS"
};

const hsmItems = (config: Configuration) => [
  ["HSM connector", config.hsmConnectorName ?? config.hsmConnectorId ?? "None"] as const,
  ...(config.externalKeyId
    ? [["HSM key label", <code key="label">{config.externalKeyId}</code>] as const]
    : [])
];

const kmsItems = (config: Configuration) => [
  ["AWS connection", config.appConnectionName ?? config.appConnectionId ?? "None"] as const,
  ...(config.externalKeyId
    ? [
        ["Region", config.region ?? "None"] as const,
        ["Key ARN", <code key="arn">{config.externalKeyId}</code>] as const
      ]
    : [])
];

const keyLocationItems = (config: Configuration, keySource: CertKeySource) => {
  if (keySource === CertKeySource.Hsm) return hsmItems(config);
  if (keySource === CertKeySource.AwsKms) return kmsItems(config);
  return [];
};

const ParentCaLink = ({ href, label }: { href: string; label: string }) => (
  <Button variant="link" asChild>
    <a href={href}>{label}</a>
  </Button>
);

const parentItems = (ca: TInternalCertificateAuthority, org: string, parentName?: string) => {
  const { parentCaId, type } = ca.configuration;
  if (type === InternalCaType.ROOT || ca.status === CaStatus.PENDING_CERTIFICATE) return [];
  return [
    [
      "Parent CA",
      parentCaId ? (
        <ParentCaLink
          key="parent"
          href={`${org}/ca/${parentCaId}`}
          label={parentName ?? parentCaId}
        />
      ) : (
        "External"
      )
    ] as const
  ];
};

export const CaDetailsCard = ({
  ca,
  org,
  parentName
}: {
  ca: TInternalCertificateAuthority;
  org: string;
  parentName?: string;
}) => {
  const keySource = ca.configuration.keySource ?? CertKeySource.Infisical;
  return (
    <Card variant="framed" title="Details">
      <DataList
        variant="props"
        density="compact"
        items={[
          ["CA type", caTypeToNameMap[ca.configuration.type], { span: "half" }],
          ["Status", <CaStatusBadge key="status" status={ca.status} />, { span: "half" }],
          ["CA ID", <code key="id">{ca.id}</code>],
          ...parentItems(ca, org, parentName),
          [
            "Key algorithm",
            certKeyAlgorithmToNameMap[ca.configuration.keyAlgorithm] ??
              ca.configuration.keyAlgorithm,
            { span: "half" }
          ],
          [
            "Key source",
            <Badge
              key="source"
              size="sm"
              tone={keySource === CertKeySource.Infisical ? "outline" : "info"}
            >
              {KEY_SOURCE_LABELS[keySource]}
            </Badge>,
            { span: "half" }
          ],
          ...keyLocationItems(ca.configuration, keySource)
        ]}
      />
    </Card>
  );
};

export const SubjectCard = ({ ca }: { ca: TInternalCertificateAuthority }) => {
  const items = (
    [
      ["Common name (CN)", ca.configuration.commonName],
      ["Organization (O)", ca.configuration.organization],
      ["Organizational unit (OU)", ca.configuration.ou],
      ["Country (C)", ca.configuration.country],
      ["State or province (ST)", ca.configuration.province],
      ["Locality (L)", ca.configuration.locality]
    ] as const
  ).filter(([, value]) => Boolean(value));
  if (!items.length) return null;
  return (
    <Card variant="framed" title="Subject">
      <DataList variant="props" density="compact" items={items} />
    </Card>
  );
};
