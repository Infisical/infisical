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
import { CertKeySource, certKeySourceLabels, TSigner } from "@app/hooks/api/signers";

const NotSet = () => <span className="text-muted">—</span>;

type Props = {
  signer: TSigner;
};

export const SignerCertificateDetailsCard = ({ signer }: Props) => {
  const orderId = signer.externalOrder ? String(signer.externalOrder.orderId) : null;
  const hasDetails = Boolean(signer.certificateId || orderId || signer.certificateHsmKeyLabel);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Details</CardTitle>
        <CardDescription>The certificate this signer signs with.</CardDescription>
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
            <Detail>
              <DetailLabel>Serial Number</DetailLabel>
              <DetailValue className="flex items-start gap-2 font-mono">
                {signer.certificateSerialNumber ? (
                  <>
                    <span className="break-all">{signer.certificateSerialNumber}</span>
                    <CopyButton
                      className="shrink-0"
                      value={signer.certificateSerialNumber}
                      ariaLabel="Copy serial number"
                    />
                  </>
                ) : (
                  <NotSet />
                )}
              </DetailValue>
            </Detail>
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
              <Detail>
                <DetailLabel>HSM Key Label</DetailLabel>
                <DetailValue className="flex items-start gap-2 font-mono">
                  <span className="break-all">{signer.certificateHsmKeyLabel}</span>
                  <CopyButton
                    className="shrink-0"
                    value={signer.certificateHsmKeyLabel}
                    ariaLabel="Copy HSM key label"
                  />
                </DetailValue>
              </Detail>
            )}
            {orderId && (
              <Detail>
                <DetailLabel>DigiCert Order ID</DetailLabel>
                <DetailValue className="flex items-start gap-2 font-mono">
                  <span className="break-all">{orderId}</span>
                  <CopyButton
                    className="shrink-0"
                    value={orderId}
                    ariaLabel="Copy DigiCert order ID"
                  />
                </DetailValue>
              </Detail>
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
