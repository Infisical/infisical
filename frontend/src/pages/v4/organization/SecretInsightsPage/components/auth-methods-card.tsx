import { Alert } from "@infisical/cipher/ui/alert";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { ShareBar } from "@infisical/cipher/ui/share-bar";
import { FingerprintIcon } from "lucide-react";

import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { TOrgAuthMethodUsage } from "@app/hooks/api/secretInsights/types";

const authMethodName = (authMethod: string) =>
  identityAuthToNameMap[authMethod as IdentityAuthMethod] ??
  authMethod
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatFetches = (count: number) =>
  `${count.toLocaleString()} ${count === 1 ? "fetch" : "fetches"}`;

export const AuthMethodsCard = ({ data }: { data: TOrgAuthMethodUsage }) => {
  const staticTokenCount =
    data.methods.find((method) => method.authMethod === IdentityAuthMethod.TOKEN_AUTH)?.count ?? 0;
  const staticTokenShare = data.totalFetches ? (staticTokenCount / data.totalFetches) * 100 : 0;

  return (
    <Card
      variant="framed"
      title="Auth Methods Used to Fetch Secrets"
      hint="Share of authenticated fetches by machine identity auth method, past 7 days."
    >
      {data.totalFetches === 0 ? (
        <EmptyState
          size="sm"
          icon={FingerprintIcon}
          title="No secret fetches in the past 7 days"
          description="Once a machine identity reads a secret, its auth method appears here."
        />
      ) : (
        <Stack gap={16}>
          <ShareBar
            label="Auth methods"
            total={data.totalFetches}
            format={formatFetches}
            items={[...data.methods]
              .sort((a, b) => b.count - a.count)
              .map((method) => ({
                id: method.authMethod,
                label: authMethodName(method.authMethod),
                value: method.count
              }))}
          />
          {staticTokenShare > 0 && (
            <Alert tone="warn">
              {`${Math.round(staticTokenShare)}% of fetches still use static tokens. Migrate those identities to a workload auth method to remove long-lived credentials.`}
            </Alert>
          )}
        </Stack>
      )}
    </Card>
  );
};
