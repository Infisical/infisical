import { useEffect, useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SheetBody, SheetFooter, SheetSections } from "@app/components/v4/ui/sheet";
import { SmallText, Text } from "@app/components/v4/ui/text";
import {
  type BillingCatalogPlan,
  type BillingCatalogProduct,
  BillingErrorCode
} from "@app/hooks/api/billing/types";

import { failed, saved, toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { billingErrorCode, fmtMoney } from "../billing-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import {
  CostSummary,
  MANAGED_BILLING_REASON,
  PaymentActionRequiredNotice,
  PaymentApprovalNotice,
  ProductSheetHeader
} from "./sheet-shared";

// The server rejects a proration date older than 15 minutes. Re-price before that so a sheet left
// open fails by refreshing the number rather than by throwing at the customer.
const PREVIEW_MAX_AGE_MS = 12 * 60 * 1000;

type Props = {
  orgId: string;
  prod: BillingCatalogProduct;
  plan: BillingCatalogPlan;
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
  const billing = useV4Adapter("billing");
  const preview = billing.usePreviewChange();
  const upgrade = billing.useUpgradeProduct();
  const [pricedAt, setPricedAt] = useState(0);
  const [paymentActionRequired, setPaymentActionRequired] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);

  const { mutate: runPreview } = preview;
  useEffect(() => {
    runPreview(
      { orgId, upgradeProductId: prod.id, upgradePlan: plan.tier },
      { onSuccess: () => setPricedAt(Date.now()) }
    );
  }, [orgId, prod.id, plan.tier]);

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
    setPaymentActionRequired(false);
    setApprovalUrl(null);
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
        toast({
          title:
            "Pricing changed while you were reviewing. Check the updated total and confirm again."
        });
        return;
      }
      priced = fresh;
    }

    if (!priced?.toPlanVersionId) {
      failed("Couldn't price this change. Please try again.");
      return;
    }

    try {
      const result = await upgrade.mutateAsync({
        orgId,
        productId: prod.id,
        plan: plan.tier,
        expectedPlanVersionId: priced.toPlanVersionId,
        prorationDate: priced.prorationDate ?? undefined
      });
      if (result.outcome === "payment_action_required" && result.paymentUrl) {
        setApprovalUrl(result.paymentUrl);
        return;
      }
      saved(`You're on ${plan.name}. It may take a moment to update here.`);
      onDone();
    } catch (error) {
      if (billingErrorCode(error) === BillingErrorCode.PaymentActionRequired) {
        setPaymentActionRequired(true);
      }
      await rePreview();
    }
  };

  const pending = upgrade.isPending;
  const dueLabel = fmtMoney(dueToday, dueToday ? 2 : 0);

  let disabledReason: string | undefined;
  if (!selfServe) {
    disabledReason = MANAGED_BILLING_REASON;
  } else if (!isCalculating && !versionId) {
    disabledReason = "This change couldn't be priced. Try again later.";
  }

  return (
    <SheetSections
      header={
        <ProductSheetHeader
          prod={prod}
          title={`Upgrade to ${plan.name}`}
          description="You'll only pay the difference for the rest of this billing period. Your renewal date doesn't change."
        />
      }
      footer={
        <SheetFooter>
          <Inline justify="between">
            <Button variant="ghost" icon="chev-left" onClick={onBack} disabled={pending}>
              Back to plans
            </Button>
            <Button
              onClick={handleUpgrade}
              disabled={isCalculating}
              disabledReason={disabledReason}
              loading={pending}
            >
              {isCalculating ? `Upgrade to ${plan.name}` : `Upgrade and pay ${dueLabel} today`}
            </Button>
          </Inline>
        </SheetFooter>
      }
    >
      <SheetBody>
        <Stack gap={16}>
          {isTrialConversion && (
            <Alert tone="info" title="This ends your trial early">
              You&apos;re already using {plan.name} on trial. Upgrading now moves you onto it for
              good and charges the difference from today.
            </Alert>
          )}

          <Stack gap={4}>
            <Text>{prod.name}</Text>
            <Inline gap={4}>
              <SmallText muted>{fromPlanName}</SmallText>
              <Icon name="chev-right" size={12} />
              <SmallText>{plan.name}</SmallText>
            </Inline>
            {plan.feature && <SmallText muted>{plan.feature}</SmallText>}
          </Stack>

          <CostSummary
            rows={[
              {
                label: "Charged today",
                note: "Prorated for the rest of this billing period",
                value: dueLabel,
                isCalculating
              },
              {
                label: "New recurring total",
                note: renewsOn ? `Billed on ${renewsOn}` : undefined,
                value: fmtMoney(recurring),
                isCalculating
              }
            ]}
          />

          {!isCalculating && (
            <ChargeBreakdown
              prorationAmount={preview.data?.prorationAmount ?? 0}
              additionalCharges={additionalCharges}
              totalDueNow={preview.data?.totalDueNow ?? 0}
            />
          )}

          {paymentActionRequired && <PaymentActionRequiredNotice orgId={orgId} />}
          {approvalUrl && <PaymentApprovalNotice paymentUrl={approvalUrl} />}
        </Stack>
      </SheetBody>
    </SheetSections>
  );
};
