import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeftIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  BillingV2Plan,
  usePreviewBillingV2Change,
  useUpgradeBillingV2Product
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import { CostSummary, CostSummaryRow, ProductIcon } from "./shared";

// The server rejects a proration date older than 15 minutes. Re-price before that so a sheet left
// open fails by refreshing the number rather than by throwing at the customer.
const PREVIEW_MAX_AGE_MS = 12 * 60 * 1000;

type Props = {
  orgId: string;
  prod: BillingV2CatalogProduct;
  plan: BillingV2Plan;
  fromPlanName: string;
  renewsOn: string | null;
  selfServe: boolean;
  // The org is mid upgrade-trial of this plan, so upgrading pulls the conversion forward rather than
  // starting something new.
  isTrialConversion: boolean;
  onBack: () => void;
  onDone: () => void;
};

export const UpgradeView = ({
  orgId,
  prod,
  plan,
  fromPlanName,
  renewsOn,
  selfServe,
  isTrialConversion,
  onBack,
  onDone
}: Props) => {
  const preview = usePreviewBillingV2Change();
  const upgrade = useUpgradeBillingV2Product();
  const [pricedAt, setPricedAt] = useState(0);

  const { mutate: runPreview } = preview;
  useEffect(() => {
    runPreview(
      { orgId, upgradeProductId: prod.id, upgradePlan: plan.tier },
      { onSuccess: () => setPricedAt(Date.now()) }
    );
  }, [orgId, prod.id, plan.tier, runPreview]);

  const isCalculating = preview.isPending || !preview.data;
  const dueToday = Math.max(preview.data?.totalDueNow ?? 0, 0);
  const recurring = preview.data?.nextRecurringTotal ?? 0;
  const additionalCharges = preview.data?.additionalCharges ?? 0;
  const versionId = preview.data?.toPlanVersionId ?? null;

  const rePreview = () =>
    new Promise<typeof preview.data>((resolve) => {
      runPreview(
        { orgId, upgradeProductId: prod.id, upgradePlan: plan.tier },
        {
          onSuccess: (fresh) => {
            setPricedAt(Date.now());
            resolve(fresh);
          },
          onError: () => resolve(undefined)
        }
      );
    });

  const handleUpgrade = async () => {
    let priced = preview.data;
    if (Date.now() - pricedAt > PREVIEW_MAX_AGE_MS) {
      const fresh = await rePreview();
      if (!fresh) {
        return;
      }
      // Every term the customer was shown has to match, not just today's charge. A republished price
      // can move the recurring total or the plan version while the prorated remainder rounds to the
      // same cents, and accepting the new version here would defeat expectedPlanVersionId.
      const changed =
        fresh.totalDueNow !== priced?.totalDueNow ||
        fresh.nextRecurringTotal !== priced?.nextRecurringTotal ||
        fresh.toPlanVersionId !== priced?.toPlanVersionId;
      if (changed) {
        createNotification({
          type: "info",
          text: "Pricing changed while you were reviewing. Check the updated total and confirm again."
        });
        return;
      }
      priced = fresh;
    }

    if (!priced?.toPlanVersionId) {
      createNotification({ type: "error", text: "Couldn't price this change. Please try again." });
      return;
    }

    try {
      await upgrade.mutateAsync({
        orgId,
        productId: prod.id,
        plan: plan.tier,
        expectedPlanVersionId: priced.toPlanVersionId,
        prorationDate: priced.prorationDate ?? undefined
      });
      createNotification({
        type: "success",
        text: `You're on ${plan.name}. It may take a moment to update here.`
      });
      onDone();
    } catch {
      // The backend's message is surfaced by the global mutation error handler (reactQuery.tsx).
      await rePreview();
    }
  };

  const pending = upgrade.isPending;

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
        <ProductIcon product={prod} size={40} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base">Upgrade to {plan.name}</SheetTitle>
          <p className="mt-1 text-sm text-muted">
            You&apos;ll only pay the difference for the rest of this billing period. Your renewal
            date doesn&apos;t change.
          </p>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        {isTrialConversion && (
          <Alert variant="info">
            <AlertTitle>This ends your trial early</AlertTitle>
            <AlertDescription>
              You&apos;re already using {plan.name} on trial. Upgrading now moves you onto it for
              good and charges the difference from today.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex min-w-0 items-center gap-3">
            <ProductIcon product={prod} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{prod.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <span>{fromPlanName}</span>
                <ArrowRight className="size-3" />
                <span className="font-medium text-foreground">{plan.name}</span>
              </div>
            </div>
          </div>
        </div>

        {plan.feature && (
          <div className="rounded-lg border border-border bg-card p-4 text-xs text-accent">
            {plan.feature}
          </div>
        )}

        <CostSummary>
          <CostSummaryRow
            label="Charged today"
            note="Prorated for the rest of this billing period"
            value={fmtMoney(dueToday, dueToday ? 2 : 0)}
            isCalculating={isCalculating}
            valueClassName="text-base"
          />
          <CostSummaryRow
            label="New recurring total"
            note={renewsOn ? `Billed on ${renewsOn}` : undefined}
            value={fmtMoney(recurring)}
            isCalculating={isCalculating}
          />
        </CostSummary>

        {!isCalculating && additionalCharges !== 0 && (
          <ChargeBreakdown
            prorationAmount={preview.data?.prorationAmount ?? 0}
            additionalCharges={additionalCharges}
            totalDueNow={preview.data?.totalDueNow ?? 0}
          />
        )}
      </div>

      <SheetFooter className="flex-row justify-between border-t">
        <Button variant="ghost" onClick={onBack} isDisabled={pending}>
          <ChevronLeftIcon />
          Back to plans
        </Button>
        <Button
          variant="org"
          onClick={handleUpgrade}
          isDisabled={!selfServe || pending || isCalculating || !versionId}
          isPending={pending}
        >
          {isCalculating
            ? `Upgrade to ${plan.name}`
            : `Upgrade · pay ${fmtMoney(dueToday, dueToday ? 2 : 0)} today`}
        </Button>
      </SheetFooter>
    </>
  );
};
