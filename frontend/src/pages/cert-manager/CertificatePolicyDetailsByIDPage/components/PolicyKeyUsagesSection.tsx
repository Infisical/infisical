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
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { RuleList } from "./RuleList";

type Props = {
  policy: TCertificatePolicy;
};

export const PolicyKeyUsagesSection = ({ policy }: Props) => {
  const ku = policy.keyUsages;
  const eku = policy.extendedKeyUsages;

  if (!ku && !eku) {
    return null;
  }

  const kuEmpty = ku && !(ku.allowed?.length || ku.required?.length || ku.denied?.length);
  const ekuEmpty = eku && !(eku.allowed?.length || eku.required?.length || eku.denied?.length);

  const formatKu = (v: string) => formatKeyUsage(v as CertKeyUsageType);
  const formatEku = (v: string) => formatExtendedKeyUsage(v as CertExtendedKeyUsageType);

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Key Usages</CardTitle>
        <CardDescription>Allowed, required, and denied certificate key usages</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {ku && (
            <div className="flex flex-col gap-y-3 border-b border-mineshaft-700 pb-3 last:border-b-0 last:pb-0">
              <div className="text-sm font-medium text-foreground">Key Usages</div>
              {kuEmpty ? (
                <p className="text-sm text-muted">
                  No key usages are allowed. Certificates issued under this policy cannot include
                  any key usages.
                </p>
              ) : (
                <>
                  <RuleList label="Allowed" values={ku.allowed} formatter={formatKu} />
                  <RuleList label="Required" values={ku.required} formatter={formatKu} />
                  <RuleList label="Denied" values={ku.denied} formatter={formatKu} />
                </>
              )}
            </div>
          )}

          {eku && (
            <div className="flex flex-col gap-y-3">
              <div className="text-sm font-medium text-foreground">Extended Key Usages</div>
              {ekuEmpty ? (
                <p className="text-sm text-muted">
                  No extended key usages are allowed. Certificates issued under this policy cannot
                  include any extended key usages.
                </p>
              ) : (
                <>
                  <RuleList label="Allowed" values={eku.allowed} formatter={formatEku} />
                  <RuleList label="Required" values={eku.required} formatter={formatEku} />
                  <RuleList label="Denied" values={eku.denied} formatter={formatEku} />
                </>
              )}
            </div>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
