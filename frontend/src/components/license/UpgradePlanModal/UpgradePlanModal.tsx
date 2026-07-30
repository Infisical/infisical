import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";

import type { UpgradeOffer } from "./resolve-upgrade-offer";
import { getUpgradeFeature, type UpgradeFeatureKey } from "./upgrade-feature-registry";
import { useUpgradeOffer } from "./useUpgradeOffer";

export type UpgradePlanModalMedia = {
  alt: string;
  src: string;
  type: "image" | "video";
};

type Props = {
  benefits?: string[];
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  text?: string;
  featureKey?: UpgradeFeatureKey;
  isEnterpriseFeature?: boolean;
  media?: UpgradePlanModalMedia;
};

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";
const CLOUD_TERMS_URL = "https://infisical.com/terms/cloud";

type UpgradePlanModalContentProps = {
  benefits?: string[];
  description?: string;
  featureName?: string;
  media?: UpgradePlanModalMedia;
  offer: UpgradeOffer;
  onClose?: () => void;
  orgId: string;
  scopeVariant: ComponentProps<typeof Button>["variant"];
};

export const UpgradePlanModalContent = ({
  benefits,
  description: featureDescription,
  featureName = "this feature",
  media,
  offer,
  onClose,
  orgId,
  scopeVariant
}: UpgradePlanModalContentProps) => {
  let title = `Unlock ${featureName}`;
  let description = featureDescription ?? "Compare available plans to unlock this feature.";

  if (offer.kind === "start-trial") {
    title = `Try ${featureName} Free for 2 weeks`;
  } else if (offer.kind === "ask-admin") {
    title = "Billing access required";
    description =
      "Ask an organization administrator with billing access to start a trial or change plans.";
  } else if (offer.kind === "loading") {
    title = "Checking plan options";
    description = "We’re checking which options are available for your organization.";
  } else if (offer.kind === "temporarily-unavailable") {
    title = "Billing changes are temporarily paused";
    description =
      "Your current subscription is unaffected. Try again later or contact your organization administrator.";
  }

  return (
    <DialogContent
      className="z-[70] w-lg max-w-[calc(100%-2rem)]"
      overlayClassName="z-[70]"
    >
      <DialogHeader className="pr-8">
        <DialogTitle className="font-alliance text-lg leading-6 font-normal">{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <DialogDescription className="text-sm">{description}</DialogDescription>
        {media?.type === "image" && (
          <img
            src={media.src}
            alt={media.alt}
            className="max-h-72 w-full rounded-lg border border-border bg-background object-cover"
            decoding="async"
          />
        )}
        {media?.type === "video" && (
          <video
            src={media.src}
            aria-label={media.alt}
            className="max-h-72 w-full rounded-lg border border-border bg-background object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        )}
        {benefits && benefits.length > 0 && (
          <ul className="space-y-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-muted">
                <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        )}
        {offer.reason === "trial-used" && (
          <Alert variant="warning" className="border-0 px-3 py-2.5">
            <AlertDescription className="text-sm text-warning">
              Free trial for {featureName} has already been used.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter className="mt-2">
        {!offer.primaryLabel && offer.kind !== "loading" && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
        {offer.kind === "loading" && (
          <Button variant={scopeVariant} isFullWidth isPending isDisabled>
            Checking eligibility
          </Button>
        )}
        {offer.kind === "start-trial" && (
          <div className="w-full space-y-2">
            <Button variant={scopeVariant} isFullWidth asChild>
              <Link
                to="/organizations/$orgId/billing"
                params={{ orgId }}
                search={offer.productId ? { product: offer.productId } : {}}
              >
                {offer.primaryLabel}
              </Link>
            </Button>
            <p className="text-center text-xs text-muted">
              Afterwards billed monthly based on usage.{" "}
              <a
                href={CLOUD_TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 transition-colors hover:text-foreground"
              >
                View billing terms
              </a>
              .
            </p>
          </div>
        )}
        {offer.kind === "view-plans" && (
          <Button variant={scopeVariant} isFullWidth asChild>
            <Link
              to="/organizations/$orgId/billing"
              params={{ orgId }}
              search={offer.productId ? { product: offer.productId } : {}}
            >
              {offer.primaryLabel}
            </Link>
          </Button>
        )}
        {offer.kind === "contact-sales" && (
          <Button variant={scopeVariant} isFullWidth asChild>
            <a href={CONTACT_SALES_URL} target="_blank" rel="noopener noreferrer">
              {offer.primaryLabel}
              <ArrowUpRight />
            </a>
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
};

export const UpgradePlanModal = ({
  benefits,
  text,
  featureKey,
  isEnterpriseFeature = false,
  isOpen = false,
  media,
  onOpenChange
}: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const feature = getUpgradeFeature(featureKey);
  const offer = useUpgradeOffer({ featureKey, isEnterpriseFeature, isOpen });
  const billingOrgId = currentOrg.rootOrgId ?? currentOrg.id;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* z-[70] keeps this above legacy v2 modals (z-[60]) that open it, e.g. RoleModal */}
      <UpgradePlanModalContent
        benefits={benefits}
        description={feature?.description ?? text}
        featureName={feature?.name}
        media={media}
        offer={offer}
        onClose={() => onOpenChange?.(false)}
        orgId={billingOrgId}
        scopeVariant={scopeVariant}
      />
    </Dialog>
  );
};
