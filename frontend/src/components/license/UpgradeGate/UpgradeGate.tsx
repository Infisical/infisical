import { useEffect } from "react";
import { CircleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loader
} from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { useGetBillingV2Catalog, useGetBillingV2Overview } from "@app/hooks/api";
import { ProductSheet } from "@app/pages/organization/BillingV2Page/components/ProductSheet";

import { buildUpgradeReturnPath, UpgradeIntent } from "./upgrade-intents";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

type Props = {
  intent: UpgradeIntent;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGranted: () => void;
};

export const UpgradeGate = ({ intent, isOpen, onOpenChange, onGranted }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const billingOrgId = currentOrg.rootOrgId ?? currentOrg.id;
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  const canLoadBilling = isOpen && canManageBilling && !isSubOrganization;
  const overview = useGetBillingV2Overview(billingOrgId, { enabled: canLoadBilling });
  const catalog = useGetBillingV2Catalog(billingOrgId, { enabled: canLoadBilling });
  const entitlement = overview.data?.entitlements[intent.productKey];

  useEffect(() => {
    if (!isOpen || !isSubOrganization) {
      return;
    }

    const search = new URLSearchParams({
      upgradeProduct: intent.productKey,
      upgradeReturnPath: buildUpgradeReturnPath(intent, window.location)
    });
    window.location.assign(`/organizations/${billingOrgId}/billing?${search.toString()}`);
  }, [billingOrgId, intent, isOpen, isSubOrganization]);

  useEffect(() => {
    if (isOpen && entitlement?.entitled) {
      onOpenChange(false);
      onGranted();
    }
  }, [entitlement?.entitled, isOpen, onGranted, onOpenChange]);

  if (!isOpen || entitlement?.entitled) {
    return null;
  }

  if (isSubOrganization) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{intent.title}</DialogTitle>
            <DialogDescription>{intent.description}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Loader size="xs" label="Opening billing" />
            Opening billing for the root organization
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!canManageBilling) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{intent.title}</DialogTitle>
            <DialogDescription>{intent.description}</DialogDescription>
          </DialogHeader>
          <Alert variant="info">
            <CircleAlert />
            <AlertDescription>
              Ask an organization member with billing management permission to start the trial or
              update the subscription.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (overview.isPending || catalog.isPending) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{intent.title}</DialogTitle>
            <DialogDescription>{intent.description}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Loader size="xs" label="Loading plan details" />
            Loading plan details
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const product = catalog.data?.find((candidate) => candidate.id === intent.productKey);
  if (overview.isError || catalog.isError || !overview.data || !product) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{intent.title}</DialogTitle>
            <DialogDescription>{intent.description}</DialogDescription>
          </DialogHeader>
          <Alert variant="danger">
            <CircleAlert />
            <AlertDescription>
              Plan details could not be loaded. Try again, or contact Infisical if the problem
              continues.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="org"
              onClick={() => {
                overview.refetch();
                catalog.refetch();
              }}
            >
              Try Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ProductSheet
      orgId={billingOrgId}
      prod={product}
      entitlement={entitlement}
      hasActiveSubscription={overview.data.subState === "active"}
      returnPath={buildUpgradeReturnPath(intent, window.location)}
      renewsOn={entitlement?.renewsOn ?? null}
      selfServe={
        overview.data.mode !== "managed" && overview.data.selfServe && !overview.data.checkoutFrozen
      }
      onClose={() => onOpenChange(false)}
      onEntitlementChanged={onGranted}
      onRemove={() => undefined}
      onContact={() => {
        window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
      }}
    />
  );
};
