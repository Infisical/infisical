import { useEffect, useRef } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Separator } from "@infisical/cipher/ui/separator";
import { Heading, Text } from "@infisical/cipher/ui/text";
import { useLocation, useRouterState } from "@tanstack/react-router";
import { Server, Shield, Vault } from "lucide-react";

import { getProductPlanSummaries } from "@app/components/license/product-plan-summary";
import {
  type CapabilityUpgradeAlternative,
  type CapabilityUpgradeIntent,
  CONTACT_SALES_URL
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isAgentVaultProjectPath } from "@app/helpers/project";
import { toV3Href } from "@app/helpers/v4Bridge";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { useOrgId, useOrgPermission } from "../access/permissions";
import { useV4Adapter, useV4Mode } from "../data/adapters";
import { orgHref } from "../links";
import { useResolveV4Href } from "../resolveV4Href";
import { ProductPlanSummaryList } from "./ProductPlanSummaryList";
import { PlanFeatureList } from "./ProductUpgradeDialog";
import { UpgradeDialogLayout } from "./UpgradeDialogLayout";

type Props = {
  intent: CapabilityUpgradeIntent;
  paywallKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  alternative?: CapabilityUpgradeAlternative;
};

type PaywallEvent = {
  paywallKey: string;
  paywallText: string;
  route: string;
  isEnterpriseFeature: boolean;
  plan: string;
};

const CapabilityUpgradeDialog = ({
  intent,
  paywallKey,
  isOpen,
  onOpenChange,
  onOpenAutoFocus,
  onCloseAutoFocus,
  alternative
}: Props) => {
  const orgId = useOrgId();
  const mode = useV4Mode();
  const resolve = useResolveV4Href();
  const { data: currentOrg } = useV4Adapter("org").useOrganization(orgId);
  const { data: subscription } = useV4Adapter("billing").useSubscription(orgId);
  const { permission } = useOrgPermission();
  const route = useRouterState({ select: (state) => state.matches.at(-1)?.routeId ?? "unknown" });
  const { pathname } = useLocation();
  const eventPropertiesRef = useRef<PaywallEvent | null>(null);
  const isInstance = intent.scope === "instance";
  const isProduct = intent.scope === "product";
  const rootOrgId = currentOrg?.rootOrgId;
  const isSubOrganization = Boolean(rootOrgId) && rootOrgId !== orgId;
  const isAgentVault =
    intent.productName === "Agent Vault" ||
    (intent.featureKey.startsWith("audit_log") && isAgentVaultProjectPath(toV3Href(pathname)));
  const canManageBilling =
    !isInstance &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);
  const canReadBilling =
    !isInstance && permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
  const productPlans = isInstance ? [] : getProductPlanSummaries(subscription?.productPlans);

  useEffect(() => {
    if (!isOpen) {
      eventPropertiesRef.current = null;
      return;
    }

    const eventProperties = {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: intent.isEnterpriseFeature,
      plan: subscription?.slug ?? "free"
    };
    eventPropertiesRef.current = eventProperties;
    if (mode !== "demo") {
      analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, orgId, eventProperties);
    }
    // Capture the opening intent once, even when the triggering popup data changes.
  }, [isOpen]);

  if (!isOpen) return null;

  const openUpgradeDestination = () => {
    if (eventPropertiesRef.current && mode !== "demo") {
      analytics.captureForOrganization(
        AnalyticsEvent.PaywallUpgradeClicked,
        orgId,
        eventPropertiesRef.current
      );
    }

    if (isInstance || isAgentVault) {
      window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(resolve(orgHref(rootOrgId ?? orgId, "/billing")));
  };

  let scopeName = intent.productName ?? "Infisical Platform";
  if (isInstance) scopeName = "Infisical Instance";
  else if (isAgentVault) scopeName = "Agent Vault";

  let scopeIcon = Shield;
  if (isInstance) scopeIcon = Server;
  else if (isProduct || isAgentVault) scopeIcon = Vault;

  let actionLabel = isSubOrganization ? "Continue to root billing" : "View plans";
  if (isInstance) actionLabel = "Contact sales";
  else if (isAgentVault) actionLabel = "Contact us";
  else if (!canReadBilling) actionLabel = "Close";

  let billingTitle = "Organization subscription required";
  let billingDescription =
    "This feature is shared across products. Review your billing options to find a subscription that includes it.";
  if (isInstance) {
    billingTitle = "Instance license required";
    billingDescription =
      "This feature is licensed for the entire instance, not an individual product. Contact our team to discuss your deployment.";
  } else if (isAgentVault) {
    billingTitle = "Contact us for access";
    billingDescription =
      "Agent Vault plans aren't available for purchase yet. Contact our team to enable this feature for your organization.";
  } else if (!canReadBilling) {
    billingTitle = "Billing access required";
    billingDescription =
      "Ask an organization member with billing access to review subscription options for this feature.";
  } else if (isSubOrganization) {
    billingTitle = "Root organization billing";
    billingDescription =
      "Sub-organizations share the root organization's subscription. Review available options in root billing.";
  } else if (!canManageBilling) {
    billingTitle = "Billing management required";
    billingDescription =
      "Ask an organization member with billing management permission to update the subscription.";
  } else if (isProduct) {
    billingTitle = "Product subscription required";
    billingDescription =
      "Review your billing options to find a subscription that includes this feature.";
  }

  const visiblePlans = isProduct
    ? productPlans.filter((plan) => plan.productName === intent.productName)
    : productPlans;
  let scopeDescription = "Managed through your organization, across its products.";
  if (isInstance) {
    scopeDescription =
      "Licensed for your entire self-hosted deployment, independently of organization product plans.";
  } else if (isAgentVault) {
    scopeDescription = "Agent Vault access is arranged directly with our team.";
  } else if (isSubOrganization) {
    scopeDescription = "Managed by your root organization and shared with its sub-organizations.";
  } else if (isProduct) {
    scopeDescription = `Managed through your organization's ${intent.productName} subscription.`;
  }

  return (
    <UpgradeDialogLayout
      scopeName={scopeName}
      icon={<Icon icon={scopeIcon} size={32} />}
      title={intent.title}
      description={scopeDescription}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <Button
          variant="primary"
          className="w-full"
          onClick={
            !isInstance && !isAgentVault && !canReadBilling
              ? () => onOpenChange(false)
              : openUpgradeDestination
          }
        >
          {actionLabel}
        </Button>
      }
    >
      <section aria-label="Feature details">
        <PlanFeatureList
          features={[
            {
              label: intent.title.replace(/^Unlock /, ""),
              description: intent.description,
              badge: intent.isEnterpriseFeature && <Badge tone="soft">Enterprise feature</Badge>
            }
          ]}
        />
      </section>
      {alternative && (
        <>
          <Separator />
          <section aria-label="Alternative option" className="flex flex-col items-start gap-3">
            <Heading level={3} size="subsection">
              {alternative.title}
            </Heading>
            <Text muted>{alternative.description}</Text>
            <Button variant="outline" onClick={alternative.onSelect}>
              {alternative.actionLabel}
            </Button>
          </section>
        </>
      )}
      {!isInstance && !isAgentVault && visiblePlans.length > 0 && (
        <>
          <Separator />
          <section aria-label="Current product plans" className="flex flex-col gap-3">
            <Heading level={3} size="subsection">
              Current product plans
            </Heading>
            <ProductPlanSummaryList plans={visiblePlans} />
          </section>
        </>
      )}
      <Alert tone="info" title={billingTitle}>
        {billingDescription}
      </Alert>
    </UpgradeDialogLayout>
  );
};

export const CapabilityUpgradeGate = ({ isOpen, ...props }: Props) => {
  if (!isOpen) return null;
  return <CapabilityUpgradeDialog {...props} isOpen={isOpen} />;
};
