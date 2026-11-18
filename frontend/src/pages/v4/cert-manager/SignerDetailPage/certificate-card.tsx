import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, InlineGrow } from "@infisical/cipher/ui/layout";
import { Link } from "@infisical/cipher/ui/link";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";

import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import {
  CertKeySource,
  certKeySourceLabels,
  getNextDigicertOrderId,
  type TSigner
} from "@app/hooks/api/signers/types";

import { CopyButton, Dash } from "../../access/org/detail-parts";
import { orgHref } from "../../links";
import { CaStatusBadge } from "../CertificateAuthoritiesPage/shared";
import { dateOnly } from "../CodeSigningPage/signer-shared";

const copyable = (
  label: string,
  copyLabel: string,
  value: string | null | undefined
): DataListItem => [
  label,
  value ? (
    <Inline key={label} gap={4} align="start" wrap={false}>
      <InlineGrow>
        <code>{value}</code>
      </InlineGrow>
      <CopyButton value={value} label={copyLabel} />
    </Inline>
  ) : (
    <Dash key={label} />
  )
];

const when = (condition: unknown, item: () => DataListItem): DataListItem[] =>
  condition ? [item()] : [];

const caItem = (orgId: string, ca: NonNullable<TSigner["certificateAuthority"]>): DataListItem => [
  "Certificate authority",
  <Inline key="ca" gap={8} align="center">
    <Link
      underline="always"
      href={orgHref(
        orgId,
        ca.type === CaType.INTERNAL
          ? `/cert-manager/ca/${ca.id}`
          : "/cert-manager/certificate-authorities?selectedTab=external"
      )}
    >
      {ca.name}
    </Link>
    {ca.status !== CaStatus.ACTIVE && <CaStatusBadge status={ca.status} />}
  </Inline>
];

export const SignerCertificateCard = ({ orgId, signer }: { orgId: string; signer: TSigner }) => {
  const ca = signer.certificateAuthority;
  const orderId = signer.externalOrder ? String(signer.externalOrder.orderId) : null;
  const nextOrderId = getNextDigicertOrderId(signer);
  const hasDetails = Boolean(signer.certificateId || orderId || signer.certificateHsmKeyLabel);
  return (
    <Card variant="framed" title="Certificate details">
      {hasDetails ? (
        <DataList
          variant="props"
          density="compact"
          items={[
            ["Common name", signer.certificateCommonName ?? signer.commonName ?? <Dash key="cn" />],
            ...when(ca, () => caItem(orgId, ca!)),
            copyable("Serial number", "Copy serial number", signer.certificateSerialNumber),
            [
              "Expires",
              signer.certificateNotAfter ? dateOnly(signer.certificateNotAfter) : <Dash key="exp" />
            ],
            [
              "Key source",
              signer.certificateKeySource ? (
                (certKeySourceLabels[signer.certificateKeySource as CertKeySource] ??
                signer.certificateKeySource)
              ) : (
                <Dash key="source" />
              )
            ],
            ...when(signer.certificateHsmKeyLabel, () =>
              copyable("HSM key label", "Copy HSM key label", signer.certificateHsmKeyLabel)
            ),
            ...when(orderId, () =>
              copyable("DigiCert order ID", "Copy DigiCert order ID", orderId)
            ),
            ...when(nextOrderId, () =>
              copyable("Next DigiCert order ID", "Copy next DigiCert order ID", String(nextOrderId))
            )
          ]}
        />
      ) : (
        <EmptyState size="sm" icon="cert" title="No certificate issued yet" />
      )}
    </Card>
  );
};
