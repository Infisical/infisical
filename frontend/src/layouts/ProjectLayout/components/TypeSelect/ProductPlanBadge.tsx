import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

const PRODUCT_KEYS: Partial<Record<ProjectType, string>> = {
  [ProjectType.SecretManager]: "secrets_manager",
  [ProjectType.CertificateManager]: "cert_management",
  [ProjectType.PAM]: "pam"
};

const PLAN_LABELS = new Map([
  ["pro", "Pro"],
  ["advanced", "Advanced"],
  ["enterprise", "Enterprise"],
  ["legacy_pro_annual", "Pro"],
  ["legacy_team", "Team"],
  ["legacy_team_annual", "Team"],
  ["legacy_enterprise", "Enterprise"]
]);

export const ProductPlanBadge = ({ type }: { type: ProjectType }) => {
  const [now, setNow] = useState(Date.now);
  const queryClient = useQueryClient();
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const productKey = PRODUCT_KEYS[type];

  const plans = subscription.productPlans ?? [];
  const product =
    plans.find((plan) => plan.productKey === productKey) ??
    (type === ProjectType.SecretManager
      ? plans.find((plan) => plan.productKey === "legacy_secret_management")
      : undefined);
  const trialEndsAt = product?.trialEndsAt ? new Date(product.trialEndsAt).getTime() : null;
  const orgId = currentOrg.id;

  useEffect(() => {
    setNow(Date.now());
    if (!trialEndsAt || !Number.isFinite(trialEndsAt) || trialEndsAt <= Date.now()) {
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout>;
    const updateAtExpiry = () => {
      const remaining = trialEndsAt - Date.now();
      if (remaining > 0) {
        timer = setTimeout(updateAtExpiry, Math.min(remaining, 2147483647));
        return;
      }
      setNow(Date.now());
      const queryKey = subscriptionQueryKeys.getOrgSubsription(orgId);
      queryClient
        .fetchQuery({ queryKey, queryFn: () => fetchOrgSubscription(orgId, true), staleTime: 0 })
        .catch(() => queryClient.invalidateQueries({ queryKey }));
    };
    updateAtExpiry();
    return () => clearTimeout(timer);
  }, [trialEndsAt, orgId, queryClient]);

  if (!product || !["active", "trialing", "grace"].includes(product.status ?? "")) {
    return null;
  }

  const hasActiveTrial =
    Boolean(product.trialPlanKey || product.status === "trialing") &&
    (!product.trialEndsAt || (trialEndsAt !== null && trialEndsAt > now));
  if (product.status === "trialing" && !hasActiveTrial && !product.trialPlanKey) return null;

  const planKey = hasActiveTrial ? (product.trialPlanKey ?? product.planKey) : product.planKey;
  const label = planKey ? PLAN_LABELS.get(planKey) : undefined;
  if (!label) return null;

  return (
    <Badge variant="info" className="shrink-0">
      {label}
      {hasActiveTrial ? " Trial" : ""}
    </Badge>
  );
};
