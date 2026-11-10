import { Card } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Grid } from "@app/components/v4/ui/layout";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import { useBillingSubscription } from "./shared";

import styles from "./billing.module.css";

const ORG_FEATURES: {
  key: string;
  label: string;
  isEnabled: (plan: SubscriptionPlan) => boolean;
  detail?: (plan: SubscriptionPlan) => string | null;
}[] = [
  {
    key: "audit-logs",
    label: "Audit logs",
    isEnabled: (plan) => plan.auditLogs,
    detail: (plan) =>
      plan.auditLogsRetentionDays ? `${plan.auditLogsRetentionDays}-day retention` : null
  },
  {
    key: "audit-log-streams",
    label: "Audit log streaming",
    isEnabled: (plan) => plan.auditLogStreams,
    detail: (plan) =>
      plan.auditLogStreamLimit > 0
        ? `up to ${plan.auditLogStreamLimit} ${plan.auditLogStreamLimit === 1 ? "stream" : "streams"}`
        : null
  },
  { key: "saml", label: "SAML SSO", isEnabled: (plan) => plan.samlSSO },
  { key: "oidc", label: "OIDC SSO", isEnabled: (plan) => plan.oidcSSO },
  { key: "ldap", label: "LDAP", isEnabled: (plan) => plan.ldap },
  { key: "scim", label: "SCIM provisioning", isEnabled: (plan) => plan.scim },
  { key: "groups", label: "User groups", isEnabled: (plan) => plan.groups },
  { key: "rbac", label: "Custom roles", isEnabled: (plan) => plan.rbac },
  { key: "mfa", label: "MFA enforcement", isEnabled: (plan) => plan.enforceMfa },
  { key: "ip-allowlist", label: "IP allowlisting", isEnabled: (plan) => plan.ipAllowlisting },
  {
    key: "sub-orgs",
    label: "Sub-organizations",
    isEnabled: (plan) => Boolean(plan.subOrganization)
  }
];

export const OrganizationFeatures = () => {
  const subscription = useBillingSubscription();
  if (!subscription) return null;
  const features = ORG_FEATURES.filter((feature) => feature.isEnabled(subscription));
  if (features.length === 0) return null;

  return (
    <Card
      variant="framed"
      title="Organization features"
      description="Unlocked by your plans and applied across every product."
    >
      <Grid columns={3} gap={12}>
        {features.map((feature) => {
          const detail = feature.detail?.(subscription);
          return (
            <span key={feature.key} className={styles.feature}>
              <Icon name="check" size={14} />
              <span>
                {feature.label}
                {detail && <span className={styles.secondary}> ({detail})</span>}
              </span>
            </span>
          );
        })}
      </Grid>
    </Card>
  );
};
