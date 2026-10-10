import { useEffect, useRef } from "react";
import { useLocation, useRouterState } from "@tanstack/react-router";
import { Check, CircleAlert, Server, Shield, Vault } from "lucide-react";

import {
  getProductPlanSummaries,
  ProductPlanSummary
} from "@app/components/license/product-plan-summary";
import { ProductPlanSummaryList } from "@app/components/license/ProductPlanSummaryList";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Separator } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import {
  CapabilityUpgradeIntent,
  CONTACT_SALES_URL,
  getCapabilityUpgradeUrl
} from "./capability-upgrade-intents";
import { UpgradeDialogLayout } from "./UpgradeDialogLayout";

type Props = {
  intent: CapabilityUpgradeIntent;
  paywallKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

const CapabilityUpgradeDialog = ({
  intent,
  paywallKey,
  isOpen,
  onOpenChange,
  onOpenAutoFocus,
  onCloseAutoFocus,
  canManageBilling = false,
  canReadBilling = false,
  productPlans = []
}: Props & {
  canManageBilling?: boolean;
  canReadBilling?: boolean;
  productPlans?: ProductPlanSummary[];
}) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const route = useRouterState({ select: (state) => state.matches.at(-1)?.routeId ?? "unknown" });
  const { pathname } = useLocation();
  const isAgentVault =
    intent.productName === "Agent Vault" ||
    (intent.featureKey.startsWith("audit_log") &&
      getOrgScopedProductFromPath(pathname) === ProjectType.AgentVault);
  const eventPropertiesRef = useRef<{
    paywallKey: string;
    paywallText: string;
    route: string;
    isEnterpriseFeature: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      eventPropertiesRef.current = null;
      return;
    }

    const eventProperties = {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: intent.isEnterpriseFeature
    };
    eventPropertiesRef.current = eventProperties;
    analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, currentOrg.id, eventProperties);
    // Capture the opening intent once, even when the triggering popup data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const isInstance = intent.scope === "instance";
  const isProduct = intent.scope === "product";
  const openUpgradeDestination = () => {
    if (eventPropertiesRef.current) {
      analytics.captureForOrganization(
        AnalyticsEvent.PaywallUpgradeClicked,
        currentOrg.id,
        eventPropertiesRef.current
      );
    }

    if (isInstance || isAgentVault) {
      window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(getCapabilityUpgradeUrl(intent, currentOrg));
  };

  let scopeName = intent.productName ?? "Infisical Platform";
  if (isInstance) scopeName = "Infisical Instance";
  else if (isAgentVault) scopeName = "Agent Vault";

  let scopeIcon = <Shield className="size-10 text-muted" />;
  if (isInstance) scopeIcon = <Server className="size-10 text-muted" />;
  else if (isProduct || isAgentVault) scopeIcon = <Vault className="size-10 text-muted" />;

  let actionLabel = isSubOrganization ? "Continue to Root Billing" : "View Plans";
  if (isInstance) actionLabel = "Contact Sales";
  else if (isAgentVault) actionLabel = "Contact Us";
  else if (!canReadBilling) actionLabel = "Close";

  let billingTitle = "Organization Subscription Required";
  let billingDescription =
    "This feature is shared across products. Review your billing options to find a subscription that includes it.";
  if (isInstance) {
    billingTitle = "Instance License Required";
    billingDescription =
      "This feature is licensed for the entire instance, not an individual product. Contact our team to discuss your deployment.";
  } else if (isAgentVault) {
    billingTitle = "Contact Us for Access";
    billingDescription =
      "Agent Vault plans aren't available for purchase yet. Contact our team to enable this feature for your organization.";
  } else if (!canReadBilling) {
    billingTitle = "Billing Access Required";
    billingDescription =
      "Ask an organization member with billing access to review subscription options for this feature.";
  } else if (isSubOrganization) {
    billingTitle = "Root Organization Billing";
    billingDescription =
      "Sub-organizations share the root organization's subscription. Review available options in root billing.";
  } else if (!canManageBilling) {
    billingTitle = "Billing Management Required";
    billingDescription =
      "Ask an organization member with billing management permission to update the subscription.";
  } else if (isProduct) {
    billingTitle = "Product Subscription Required";
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
      icon={scopeIcon}
      title={intent.title}
      description={scopeDescription}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <Button
          data-upgrade-cta
          variant="org"
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
      <section aria-label="Feature details" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Feature Details</h3>
          {intent.isEnterpriseFeature && <Badge variant="info">Enterprise Feature</Badge>}
        </div>
        <ul className="flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="text-sm">
              <p className="font-medium">{intent.title.replace(/^Unlock /, "")}</p>
              <p className="mt-1 text-muted">{intent.description}</p>
            </div>
          </li>
        </ul>
      </section>
      {!isInstance && !isAgentVault && visiblePlans.length > 0 && (
        <>
          <Separator />
          <section aria-label="Current product plans" className="flex flex-col gap-4">
            <h3 className="text-sm font-medium">Current Product Plans</h3>
            <ProductPlanSummaryList plans={visiblePlans} />
          </section>
        </>
      )}
      <Alert variant="info">
        <CircleAlert />
        <AlertTitle>{billingTitle}</AlertTitle>
        <AlertDescription>{billingDescription}</AlertDescription>
      </Alert>
    </UpgradeDialogLayout>
  );
};

const PlatformCapabilityUpgradeGate = (props: Props) => {
  const { permission } = useOrgPermission();
  const { subscription } = useSubscription();
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  const canReadBilling = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );
  return (
    <CapabilityUpgradeDialog
      {...props}
      canManageBilling={canManageBilling}
      canReadBilling={canReadBilling}
      productPlans={getProductPlanSummaries(subscription.productPlans)}
    />
  );
};

export const CapabilityUpgradeGate = ({ isOpen, intent, ...props }: Props) => {
  if (!isOpen) return null;

  return intent.scope === "instance" ? (
    <CapabilityUpgradeDialog {...props} isOpen={isOpen} intent={intent} />
  ) : (
    <PlatformCapabilityUpgradeGate {...props} isOpen={isOpen} intent={intent} />
  );
};
