import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  paywallKey: string;
  text: string;
  // akhilmhdh: We will come back to this late. Otherwise would need to change in a lot of places.
  // eslint-disable-next-line
  isEnterpriseFeature?: boolean;
};

export const UpgradePlanModal = ({
  text,
  isOpen,
  onOpenChange,
  paywallKey,
  isEnterpriseFeature
}: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "unknown"
  });
  const eventPropertiesRef = useRef<{
    paywallKey: string;
    paywallText: string;
    route: string;
    isEnterpriseFeature: boolean;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const eventProperties = {
        paywallKey,
        paywallText: text,
        route,
        isEnterpriseFeature: Boolean(isEnterpriseFeature)
      };
      eventPropertiesRef.current = eventProperties;
      analytics.captureForOrganization(
        AnalyticsEvent.PaywallViewed,
        currentOrg.id,
        eventProperties
      );
    } else {
      eventPropertiesRef.current = null;
    }
    // The event should fire once per closed-to-open transition, not when copy or route context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleUpgradeClick = () => {
    const eventProperties = eventPropertiesRef.current;
    if (!eventProperties) return;

    analytics.captureForOrganization(
      AnalyticsEvent.PaywallUpgradeClicked,
      currentOrg.id,
      eventProperties
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Keep upgrade prompts above the dialog or sheet that triggered them. */}
      <DialogContent className="z-[70] sm:max-w-xl" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <SparklesIcon className="size-5 text-muted" />
            Unleash Infisical&apos;s Full Power
          </DialogTitle>
          <DialogDescription>
            Upgrade and get access to this, as well as to other powerful enhancements.
          </DialogDescription>
        </DialogHeader>

        <Separator />
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
            <Button variant={scopeVariant} onClick={handleUpgradeClick}>
              Upgrade Plan
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
