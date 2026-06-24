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
import { CertPolicyState } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type Props = {
  policy: TCertificatePolicy;
};

const policyStateLabel: Record<CertPolicyState, string> = {
  [CertPolicyState.ALLOWED]: "Allowed",
  [CertPolicyState.REQUIRED]: "Required",
  [CertPolicyState.DENIED]: "Denied"
};

const policyStateVariant = (state: CertPolicyState): "success" | "info" | "danger" | "neutral" => {
  switch (state) {
    case CertPolicyState.REQUIRED:
      return "success";
    case CertPolicyState.DENIED:
      return "danger";
    case CertPolicyState.ALLOWED:
      return "info";
    default:
      return "neutral";
  }
};

export const PolicyValiditySection = ({ policy }: Props) => {
  const maxValidity = policy.validity?.max;
  const { basicConstraints } = policy;

  if (!maxValidity && !basicConstraints) {
    return null;
  }

  const isCAState = basicConstraints?.isCA as CertPolicyState | undefined;

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Validity & Constraints</CardTitle>
        <CardDescription>
          Lifetime and basic constraints applied to issued certificates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {maxValidity && (
            <Detail>
              <DetailLabel>Maximum Validity</DetailLabel>
              <DetailValue>{maxValidity}</DetailValue>
            </Detail>
          )}

          {isCAState && (
            <Detail>
              <DetailLabel>Is CA</DetailLabel>
              <DetailValue>
                <Badge variant={policyStateVariant(isCAState)}>{policyStateLabel[isCAState]}</Badge>
              </DetailValue>
            </Detail>
          )}

          {basicConstraints?.maxPathLength !== undefined && (
            <Detail>
              <DetailLabel>Max Path Length</DetailLabel>
              <DetailValue>{basicConstraints.maxPathLength}</DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
