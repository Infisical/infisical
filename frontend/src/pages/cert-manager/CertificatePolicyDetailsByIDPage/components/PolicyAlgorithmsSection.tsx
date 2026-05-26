import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import {
  CertKeyAlgorithm,
  CertSignatureAlgorithm,
  getKeyAlgorithmDisplayName,
  getSignatureAlgorithmDisplayName,
  mapPolicyKeyAlgorithmToApi,
  mapPolicySignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type Props = {
  policy: TCertificatePolicy;
};

export const PolicyAlgorithmsSection = ({ policy }: Props) => {
  const signatures = policy.algorithms?.signature ?? [];
  const keys = policy.algorithms?.keyAlgorithm ?? [];

  if (signatures.length === 0 && keys.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Algorithms</CardTitle>
        <CardDescription>Allowed cryptographic algorithms for issued certificates</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {signatures.length > 0 && (
            <Detail>
              <DetailLabel>Signature Algorithms</DetailLabel>
              <DetailValue className="flex flex-wrap gap-1">
                {signatures.map((sig) => (
                  <Badge key={sig} variant="neutral">
                    {getSignatureAlgorithmDisplayName(
                      mapPolicySignatureAlgorithmToApi(sig) as CertSignatureAlgorithm
                    )}
                  </Badge>
                ))}
              </DetailValue>
            </Detail>
          )}

          {keys.length > 0 && (
            <Detail>
              <DetailLabel>Key Algorithms</DetailLabel>
              <DetailValue className="flex flex-wrap gap-1">
                {keys.map((key) => (
                  <Badge key={key} variant="neutral">
                    {getKeyAlgorithmDisplayName(
                      mapPolicyKeyAlgorithmToApi(key) as CertKeyAlgorithm
                    )}
                  </Badge>
                ))}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
