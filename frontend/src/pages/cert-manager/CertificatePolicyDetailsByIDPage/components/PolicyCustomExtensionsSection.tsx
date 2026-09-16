import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DetailGroup
} from "@app/components/v3";
import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import {
  CertExtensionCriticality,
  customExtensionLabelFor
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { RuleList } from "./RuleList";

type Props = {
  policy: TCertificatePolicy;
};

const CRITICALITY_LABEL: Record<CertExtensionCriticality, string> = {
  [CertExtensionCriticality.CRITICAL]: "Always critical",
  [CertExtensionCriticality.NOT_CRITICAL]: "Never critical"
};

export const PolicyCustomExtensionsSection = ({ policy }: Props) => {
  if (!policy.customExtensions) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Custom Extensions</CardTitle>
        <CardDescription>
          Constraints on custom X.509 extensions in issued certificates
        </CardDescription>
      </CardHeader>
      <CardContent>
        {policy.customExtensions.length === 0 ? (
          <p className="text-sm text-muted">
            No custom extensions are allowed. Certificates issued under this policy cannot include
            any custom extensions.
          </p>
        ) : (
          <DetailGroup>
            {policy.customExtensions.map((rule) => (
              <div
                key={rule.oid}
                className="flex flex-col gap-y-3 border-b border-mineshaft-700 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {customExtensionLabelFor(rule.oid, rule.label)}
                  </span>
                  {rule.critical && (
                    <Badge variant="neutral">{CRITICALITY_LABEL[rule.critical]}</Badge>
                  )}
                </div>
                <p className="font-mono text-xs text-mineshaft-400">{rule.oid}</p>
                {Boolean(rule.required?.length) && (
                  <RuleList label="Required" values={rule.required ?? []} />
                )}
                {Boolean(rule.allowed?.length) && (
                  <RuleList label="Allowed" values={rule.allowed ?? []} />
                )}
                {Boolean(rule.denied?.length) && (
                  <RuleList label="Denied" values={rule.denied ?? []} />
                )}
              </div>
            ))}
          </DetailGroup>
        )}
      </CardContent>
    </Card>
  );
};
