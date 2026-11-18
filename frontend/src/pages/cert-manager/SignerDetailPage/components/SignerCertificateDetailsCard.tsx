import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { caStatusToNameMap, getCaStatusBadgeVariant } from "@app/hooks/api/ca/constants";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import {
  CertKeySource,
  certKeySourceLabels,
  getNextDigicertOrderId,
  TSigner
} from "@app/hooks/api/signers";

import { getCertManagerLink } from "../../cert-manager-link";
import { CertificateAuthorityTab } from "../../CertificateAuthoritiesPage/CertificateAuthoritiesPage";

const NotSet = () => <span className="text-muted">-</span>;

const SignerCaDetail = ({ signer }: { signer: TSigner }) => {
  const { currentProject } = useProject();
  const ca = signer.certificateAuthority;
  if (!ca) return null;

  return (
    <Detail>
      <DetailLabel>Certificate Authority</DetailLabel>
      <DetailValue className="flex flex-wrap items-center gap-2">
        <Link
          {...(ca.type === CaType.INTERNAL
            ? getCertManagerLink(currentProject, `ca/${ca.id}`)
            : getCertManagerLink(currentProject, "certificate-authorities", {
                selectedTab: CertificateAuthorityTab.External
              }))}
          className="inline-flex items-center gap-1 underline"
        >
          {ca.name}
          <ExternalLinkIcon className="size-3.5 text-muted" />
        </Link>
        {ca.status !== CaStatus.ACTIVE && (
          <Badge variant={getCaStatusBadgeVariant(ca.status)}>{caStatusToNameMap[ca.status]}</Badge>
        )}
      </DetailValue>
    </Detail>
  );
};

type Props = {
  signer: TSigner;
};

const CopyableDetail = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <Detail>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue className="flex items-start gap-2 font-mono">
      {value ? (
        <>
          <span className="break-all">{value}</span>
          <CopyButton className="shrink-0" value={value} ariaLabel={`Copy ${label}`} />
        </>
      ) : (
        <NotSet />
      )}
    </DetailValue>
  </Detail>
);

export const SignerCertificateDetailsCard = ({ signer }: Props) => {
  const orderId = signer.externalOrder ? String(signer.externalOrder.orderId) : null;
  const nextOrderId = getNextDigicertOrderId(signer);
  const hasDetails = Boolean(signer.certificateId || orderId || signer.certificateHsmKeyLabel);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Details</CardTitle>
        <CardDescription>The certificate issued to this signer.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasDetails ? (
          <DetailGroup>
            <Detail>
              <DetailLabel>Common Name</DetailLabel>
              <DetailValue>
                {signer.certificateCommonName ?? signer.commonName ?? <NotSet />}
              </DetailValue>
            </Detail>
            <SignerCaDetail signer={signer} />
            <CopyableDetail label="Serial Number" value={signer.certificateSerialNumber} />
            <Detail>
              <DetailLabel>Expires</DetailLabel>
              <DetailValue>
                {signer.certificateNotAfter ? (
                  format(new Date(signer.certificateNotAfter), "MMM d, yyyy")
                ) : (
                  <NotSet />
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Key Source</DetailLabel>
              <DetailValue>
                {signer.certificateKeySource ? (
                  (certKeySourceLabels[signer.certificateKeySource as CertKeySource] ??
                  signer.certificateKeySource)
                ) : (
                  <NotSet />
                )}
              </DetailValue>
            </Detail>
            {signer.certificateHsmKeyLabel && (
              <CopyableDetail label="HSM Key Label" value={signer.certificateHsmKeyLabel} />
            )}
            {orderId && <CopyableDetail label="DigiCert Order ID" value={orderId} />}
            {nextOrderId && (
              <CopyableDetail label="Next DigiCert Order ID" value={String(nextOrderId)} />
            )}
          </DetailGroup>
        ) : (
          <Empty className="border">
            <EmptyTitle>No certificate issued yet</EmptyTitle>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
};
