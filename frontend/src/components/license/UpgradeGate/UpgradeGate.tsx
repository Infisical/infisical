import { useEffect, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Sparkles } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
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
import {
  BillingV2Plan,
  useGetBillingV2Catalog,
  useGetBillingV2Overview,
  useStartBillingV2Trial
} from "@app/hooks/api";
import { fmtMoney } from "@app/pages/organization/BillingV2Page/billing-v2-format";

import { buildUpgradeReturnPath, UpgradeIntent } from "./upgrade-intents";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

type Props = {
  intent: UpgradeIntent;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGranted: () => void;
};

type GateView = "plan" | "confirm";

const monthlyPrice = (plan: BillingV2Plan) => {
  if (plan.base?.monthly) {
    return plan.base.monthly;
  }
  return plan.dims.find((dimension) => dimension.monthly > 0)?.monthly ?? 0;
};

export const UpgradeGate = ({ intent, isOpen, onOpenChange, onGranted }: Props) => {
  const [view, setView] = useState<GateView>("plan");
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
  const startTrial = useStartBillingV2Trial();
  const entitlement = overview.data?.entitlements[intent.productKey];

  useEffect(() => {
    if (!isOpen) {
      setView("plan");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && entitlement?.entitled) {
      onOpenChange(false);
      onGranted();
    }
  }, [entitlement?.entitled, isOpen, onGranted, onOpenChange]);

  if (!isOpen || entitlement?.entitled) {
    return null;
  }

  const returnPath = buildUpgradeReturnPath(intent, window.location);
  const openRootBilling = () => {
    const search = new URLSearchParams({
      upgradeProduct: intent.productKey,
      upgradeReturnPath: returnPath
    });
    window.location.assign(`/organizations/${billingOrgId}/billing?${search.toString()}`);
  };

  if (isSubOrganization) {
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
              Sub-organizations share the root organization&apos;s subscription. Continue to root
              billing to start the trial or update the subscription.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="org" onClick={openRootBilling}>
              Continue to Root Billing
            </Button>
          </DialogFooter>
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
            <Button variant="org" onClick={openRootBilling}>
              Continue to Billing
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

  const plan = product.plans.find((candidate) => candidate.tier === intent.planKey);
  if (!plan) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{intent.title}</DialogTitle>
            <DialogDescription>{intent.description}</DialogDescription>
          </DialogHeader>
          <Alert variant="danger">
            <CircleAlert />
            <AlertDescription>This plan is not available for your organization.</AlertDescription>
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

  const trialAvailable = plan.selfServe && plan.trialable;
  const selfServe =
    overview.data.mode !== "managed" && overview.data.selfServe && !overview.data.checkoutFrozen;
  const price = monthlyPrice(plan);
  const trialLength = plan.trialDays > 0 ? `${plan.trialDays}-day` : "free";
  const trialBadgeLabel = plan.trialDays > 0 ? `${plan.trialDays}-Day Trial` : "Free Trial";
  const trialButtonLabel =
    plan.trialDays > 0 ? `Start ${plan.trialDays}-Day Free Trial` : "Start Free Trial";

  const handleStartTrial = async () => {
    try {
      const result = await startTrial.mutateAsync({
        orgId: billingOrgId,
        productId: product.id,
        plan: plan.tier,
        returnPath
      });

      if (result.outcome === "awaiting_card") {
        if (result.cardSetupUrl) {
          window.location.assign(result.cardSetupUrl);
          return;
        }
        createNotification({
          type: "error",
          text: "Failed to open secure card setup. Please try again."
        });
        return;
      }

      createNotification({ type: "success", text: `Your ${plan.name} trial has started.` });
      onOpenChange(false);
      onGranted();
    } catch {
      setView("plan");
    }
  };

  let primaryAction = (
    <Button variant="org" onClick={openRootBilling}>
      View Billing Options
    </Button>
  );
  if (!selfServe) {
    primaryAction = (
      <Button
        variant="org"
        onClick={() => window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer")}
      >
        Contact Sales
      </Button>
    );
  } else if (trialAvailable) {
    primaryAction = (
      <Button variant="org" onClick={() => setView("confirm")}>
        {trialButtonLabel}
      </Button>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {view === "plan" ? (
          <>
            <DialogHeader>
              <DialogTitle>{intent.title}</DialogTitle>
              <DialogDescription>{intent.description}</DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-foreground">{plan.name}</span>
                      {trialAvailable && <Badge variant="success">{trialBadgeLabel}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{plan.feature}</p>
                  </div>
                  {price > 0 && (
                    <div className="text-right">
                      <span className="text-2xl font-medium text-foreground">
                        {fmtMoney(price)}
                      </span>
                      <span className="text-sm text-muted"> / month</span>
                    </div>
                  )}
                </div>

                {product.includes && product.includes.length > 0 && (
                  <div className="grid gap-x-5 gap-y-2 border-t border-border pt-4 sm:grid-cols-2">
                    {product.includes.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm text-accent">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!selfServe && (
              <Alert variant="info">
                <CircleAlert />
                <AlertDescription>
                  Contact your Infisical account manager to update this subscription.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {primaryAction}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <DialogTitle>Start your {plan.name} trial</DialogTitle>
              <DialogDescription>
                Your {trialLength} trial is free. A payment method is required; if you do not have
                one on file, you will complete secure card setup before the trial starts. After the
                trial, billing continues monthly unless you cancel.
              </DialogDescription>
            </DialogHeader>

            <div className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium text-foreground">Due today</div>
                  <div className="text-muted">Free during your trial</div>
                </div>
                <span className="font-medium text-foreground">$0</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium text-foreground">After your trial</div>
                  <div className="text-muted">Billed monthly based on usage</div>
                </div>
                <span className="font-medium text-foreground">
                  {price > 0 ? `${fmtMoney(price)} / month` : "Usage-based"}
                </span>
              </div>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                isDisabled={startTrial.isPending}
                onClick={() => setView("plan")}
              >
                <ArrowLeft />
                Back
              </Button>
              <Button
                variant="org"
                isPending={startTrial.isPending}
                isDisabled={startTrial.isPending}
                onClick={handleStartTrial}
              >
                Start Free Trial
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
