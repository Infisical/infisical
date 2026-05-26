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
  CertSubjectAttributeType,
  formatSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type Props = {
  policy: TCertificatePolicy;
};

const RuleList = ({ label, values }: { label: string; values?: string[] }) => {
  if (!values || values.length === 0) return null;
  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue className="flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={`${label}-${value}`} variant="neutral">
            {value}
          </Badge>
        ))}
      </DetailValue>
    </Detail>
  );
};

export const PolicySubjectRulesSection = ({ policy }: Props) => {
  const entries = (policy.subject ?? []).filter(
    (rule) =>
      (rule.allowed && rule.allowed.length > 0) ||
      (rule.required && rule.required.length > 0) ||
      (rule.denied && rule.denied.length > 0)
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Subject Rules</CardTitle>
        <CardDescription>Constraints on the certificate subject distinguished name</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {entries.map((rule, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`${rule.type}-${idx}`}
              className="flex flex-col gap-y-3 border-b border-mineshaft-700 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="text-sm font-medium text-foreground">
                {formatSubjectAttributeType(rule.type as CertSubjectAttributeType)}
              </div>
              <RuleList label="Allowed" values={rule.allowed} />
              <RuleList label="Required" values={rule.required} />
              <RuleList label="Denied" values={rule.denied} />
            </div>
          ))}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
