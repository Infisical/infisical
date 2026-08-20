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
  CertSubjectAttributeType,
  formatSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { RuleList } from "./RuleList";

const formatDomainComponentChain = (value: string) =>
  value
    .split(",")
    .map((component) => `DC=${component.trim()}`)
    .join(" ");

type Props = {
  policy: TCertificatePolicy;
};

export const PolicySubjectRulesSection = ({ policy }: Props) => {
  if (!policy.subject) {
    return null;
  }

  const entries = policy.subject.filter(
    (rule) =>
      (rule.allowed && rule.allowed.length > 0) ||
      (rule.required && rule.required.length > 0) ||
      (rule.denied && rule.denied.length > 0)
  );

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Subject Rules</CardTitle>
        <CardDescription>Constraints on the certificate subject distinguished name</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            No subject attributes are allowed. Certificates issued under this policy cannot include
            any subject attributes.
          </p>
        ) : (
          <DetailGroup>
            {entries.map((rule, idx) => {
              const isDomainComponent = rule.type === CertSubjectAttributeType.DOMAIN_COMPONENT;
              const formatter = isDomainComponent ? formatDomainComponentChain : undefined;

              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${rule.type}-${idx}`}
                  className="flex flex-col gap-y-3 border-b border-mineshaft-700 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="text-sm font-medium text-foreground">
                    {formatSubjectAttributeType(rule.type as CertSubjectAttributeType)}
                  </div>
                  <RuleList
                    label="Allowed"
                    values={rule.allowed}
                    formatter={formatter}
                    isMonospace={isDomainComponent}
                  />
                  <RuleList
                    label="Required"
                    values={rule.required}
                    formatter={formatter}
                    isMonospace={isDomainComponent}
                  />
                  <RuleList
                    label="Denied"
                    values={rule.denied}
                    formatter={formatter}
                    isMonospace={isDomainComponent}
                  />
                </div>
              );
            })}
          </DetailGroup>
        )}
      </CardContent>
    </Card>
  );
};
