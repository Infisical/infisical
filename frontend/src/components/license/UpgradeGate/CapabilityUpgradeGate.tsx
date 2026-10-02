import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert, Server, Shield, Vault } from "lucide-react";

import { Alert, AlertDescription, Button } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { CapabilityUpgradeIntent, getCapabilityUpgradeUrl } from "./capability-upgrade-intents";
import { UpgradeDialogLayout } from "./UpgradeDialogLayout";

type Props = {
  intent: CapabilityUpgradeIntent;
  paywallKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const CapabilityUpgradeDialog = ({
  intent,
  paywallKey,
  isOpen,
  onOpenChange,
  canManageBilling = false
}: Props & { canManageBilling?: boolean }) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const route = useRouterState({ select: (state) => state.matches.at(-1)?.routeId ?? "unknown" });
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

    if (isInstance) {
      window.open(getCapabilityUpgradeUrl(intent, currentOrg), "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(getCapabilityUpgradeUrl(intent, currentOrg));
  };

  let scopeIcon = <Shield className="size-10 text-muted" />;
  if (isInstance) scopeIcon = <Server className="size-10 text-muted" />;
  else if (isProduct) scopeIcon = <Vault className="size-10 text-muted" />;

  let actionLabel = isSubOrganization ? "Continue to Root Billing" : "View Plans";
  if (isInstance) actionLabel = "Contact Sales";

  let billingDescription =
    "This capability is shared across products. Review your billing options to find a subscription that includes it.";
  if (isInstance) {
    billingDescription =
      "This capability is licensed for the entire instance, not an individual product. Contact our team to discuss your deployment.";
  } else if (isSubOrganization) {
    billingDescription =
      "Sub-organizations share the root organization's subscription. Review available options in root billing.";
  } else if (!canManageBilling) {
    billingDescription =
      "Ask an organization member with billing management permission to update the subscription.";
  } else if (isProduct) {
    billingDescription =
      "Review your billing options to find a subscription that includes this capability.";
  }

  return (
    <UpgradeDialogLayout
      scopeName={isInstance ? "Infisical Instance" : (intent.productName ?? "Infisical Platform")}
      icon={scopeIcon}
      title={intent.title}
      description={
        isInstance
          ? "Review licensing for your self-hosted instance."
          : "Review your organization's subscription options."
      }
      onOpenChange={onOpenChange}
      footer={
        <Button data-upgrade-cta variant="org" className="w-full" onClick={openUpgradeDestination}>
          {actionLabel}
        </Button>
      }
    >
      <p className="text-sm text-foreground">{intent.description}</p>
      <Alert variant="info">
        <CircleAlert />
        <AlertDescription>{billingDescription}</AlertDescription>
      </Alert>
    </UpgradeDialogLayout>
  );
};

const PlatformCapabilityUpgradeGate = (props: Props) => {
  const { permission } = useOrgPermission();
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  return <CapabilityUpgradeDialog {...props} canManageBilling={canManageBilling} />;
};

export const CapabilityUpgradeGate = ({ isOpen, intent, ...props }: Props) => {
  if (!isOpen) return null;

  return intent.scope === "instance" ? (
    <CapabilityUpgradeDialog {...props} isOpen={isOpen} intent={intent} />
  ) : (
    <PlatformCapabilityUpgradeGate {...props} isOpen={isOpen} intent={intent} />
  );
};
