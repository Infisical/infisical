import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert, Server, Shield } from "lucide-react";

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

const PlatformCapabilityUpgradeGate = (props: Props) => {
  const { permission } = useOrgPermission();
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  return <CapabilityUpgradeDialog {...props} canManageBilling={canManageBilling} />;
};

export const CapabilityUpgradeGate = (props: Props) => {
  if (!props.isOpen) return null;

  return props.intent.scope === "instance" ? (
    <CapabilityUpgradeDialog {...props} />
  ) : (
    <PlatformCapabilityUpgradeGate {...props} />
  );
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

  return (
    <UpgradeDialogLayout
      scopeName={isInstance ? "Infisical Instance" : "Infisical Platform"}
      icon={
        isInstance ? (
          <Server className="size-10 text-muted" />
        ) : (
          <Shield className="size-10 text-muted" />
        )
      }
      title={intent.title}
      description={
        isInstance
          ? "Review licensing for your self-hosted instance."
          : "Review your organization's subscription options."
      }
      onOpenChange={onOpenChange}
      footer={
        <>
          <p className="text-center text-sm font-medium">{intent.title}</p>
          <Button data-upgrade-cta variant="org" className="w-full" onClick={openUpgradeDestination}>
            {isInstance ? "Contact Sales" : isSubOrganization ? "Continue to Root Billing" : "View Plans"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">{intent.description}</p>
      <Alert variant="info">
        <CircleAlert />
        <AlertDescription>
          {isInstance
            ? "This capability is licensed for the entire instance, not an individual product. Contact our team to discuss your deployment."
            : isSubOrganization
              ? "Sub-organizations share the root organization's subscription. Review available options in root billing."
              : !canManageBilling
                ? "Ask an organization member with billing management permission to update the subscription."
                : "This capability is shared across products. Review your billing options to find a subscription that includes it."}
        </AlertDescription>
      </Alert>
    </UpgradeDialogLayout>
  );
};
