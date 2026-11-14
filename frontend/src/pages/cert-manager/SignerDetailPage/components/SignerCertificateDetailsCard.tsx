import { format } from "date-fns";

import {
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
import {
  CertKeySource,
  certKeySourceLabels,
  getNextDigicertOrderId,
  TSigner
} from "@app/hooks/api/signers";

const NotSet = () => <span className="text-muted">-</span>;

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
