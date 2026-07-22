import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DetailGroup
} from "@app/components/v3";
import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import {
  CertSubjectAlternativeNameType,
  formatSANType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { RuleList } from "./RuleList";

type Props = {
  policy: TCertificatePolicy;
};

export const PolicySansRulesSection = ({ policy }: Props) => {
  if (!policy.sans) {
    return null;
  }

  const entries = policy.sans.filter(
    (rule) =>
      (rule.allowed && rule.allowed.length > 0) ||
      (rule.required && rule.required.length > 0) ||
      (rule.denied && rule.denied.length > 0)
  );

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Subject Alternative Names</CardTitle>
        <CardDescription>Constraints on SAN entries in issued certificates</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            No subject alternative names are allowed. Certificates issued under this policy cannot
            include any SANs.
          </p>
        ) : (
          <DetailGroup>
            {entries.map((rule, idx) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={`${rule.type}-${idx}`}
                className="flex flex-col gap-y-3 border-b border-mineshaft-700 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="text-sm font-medium text-foreground">
                  {formatSANType(rule.type as CertSubjectAlternativeNameType)}
                </div>
                <RuleList label="Allowed" values={rule.allowed} />
                <RuleList label="Required" values={rule.required} />
                <RuleList label="Denied" values={rule.denied} />
              </div>
            ))}
          </DetailGroup>
        )}
      </CardContent>
    </Card>
  );
};
