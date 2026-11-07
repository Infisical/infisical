import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { useSubscription } from "@app/context";
import { SubscriptionPlan } from "@app/hooks/api/types";

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
  const { subscription } = useSubscription();
  const [isOpen, setIsOpen] = useState(true);
  const features = ORG_FEATURES.filter((feature) => feature.isEnabled(subscription));
  if (features.length === 0) return null;
  const panelId = "billing-organization-features";

  return (
    <div className="-mx-5 -mb-5 flex flex-col gap-3 border-t border-border px-5 py-3.5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className="flex cursor-pointer items-baseline gap-2 self-start rounded-xs text-left outline-0 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDownIcon className="size-3.5 shrink-0 self-center" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0 self-center text-muted" />
        )}
        <span className="text-[13px] font-medium">Organization Features</span>
        <span className="text-xs text-muted">
          Unlocked by your plans and applied across every product
        </span>
      </button>
      {isOpen && (
        <ul
          id={panelId}
          className="grid grid-cols-1 gap-x-6 gap-y-2.5 pl-5.5 md:grid-cols-2 xl:grid-cols-3"
        >
          {features.map((feature) => {
            const detail = feature.detail?.(subscription);
            return (
              <li key={feature.key} className="flex items-baseline gap-2">
                <CheckIcon className="size-3.5 shrink-0 self-center text-success" />
                <span className="text-[13px]">{feature.label}</span>
                {detail && <span className="text-xs text-muted">({detail})</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
