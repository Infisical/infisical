import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  CopyButton,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { TCaCrossSignedCertificate } from "@app/hooks/api/ca/types";

import {
  formatCertificateDate,
  getCrossSignedCertStatus,
  TCrossSignedCertSummary
} from "./crossSignedCertUtils";

type Props = {
  crossSignedCert: TCaCrossSignedCertificate;
  summary: TCrossSignedCertSummary;
};

export const CaCrossSignedCertDetails = ({ crossSignedCert, summary }: Props) => {
  const status = getCrossSignedCertStatus(summary);

  return (
    <div className="flex flex-col gap-4">
      {status.alert && (
        <Alert variant={status.variant}>
          <status.Icon />
          <AlertTitle>{status.alert.title}</AlertTitle>
          <AlertDescription>{status.alert.body}</AlertDescription>
        </Alert>
      )}
      <DetailGroup>
        <div className="grid grid-cols-2 gap-4">
          <DetailGroup>
            <Detail>
              <DetailLabel>Signed By</DetailLabel>
              <DetailValue className="break-words">{summary.issuerName}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Not Before</DetailLabel>
              <DetailValue>{formatCertificateDate(summary.notBefore)}</DetailValue>
            </Detail>
          </DetailGroup>
          <DetailGroup>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <Badge variant={status.variant}>
                  <status.Icon />
                  {status.label}
                </Badge>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Not After</DetailLabel>
              <DetailValue>{formatCertificateDate(summary.notAfter)}</DetailValue>
            </Detail>
          </DetailGroup>
        </div>
        <Detail>
          <DetailLabel>Serial Number</DetailLabel>
          <DetailValue className="flex items-center gap-2 font-mono text-xs break-all">
            {crossSignedCert.serialNumber.toUpperCase()}
            <CopyButton
              value={crossSignedCert.serialNumber.toUpperCase()}
              ariaLabel="Copy serial number"
            />
          </DetailValue>
        </Detail>
        {summary.chainRootName && (
          <Detail>
            <DetailLabel>Chain Root</DetailLabel>
            <DetailValue>{summary.chainRootName}</DetailValue>
          </Detail>
        )}
      </DetailGroup>
    </div>
  );
};
