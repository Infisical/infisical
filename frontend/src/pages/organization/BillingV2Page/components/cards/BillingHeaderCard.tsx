import { ReactNode } from "react";
import { Info } from "lucide-react";

import { Badge, Card } from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Overview } from "@app/hooks/api";

import { cadenceLabel, fmtMoney, nextChargeProductLabel } from "../../billing-v2-format";
import { BillingV2RenderState } from "../../billing-v2-view-types";
import { ActiveBadge } from "../shared";

const StatusBadge = ({ subState }: { subState: BillingV2RenderState }) => {
  if (subState === "trialing") {
    return <Badge variant="info">Trial</Badge>;
  }
  if (subState === "past-due") {
    return <Badge variant="warning">Past due</Badge>;
  }
  if (subState === "suspended") {
    return <Badge variant="danger">Suspended</Badge>;
  }
  return <ActiveBadge />;
};

const HeaderColumn = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-1 flex-col gap-3 px-6 py-5">
    <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
    {children}
  </div>
);

type BillingHeaderCardProps = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
};

// The three-column header: ACCOUNT (standing), NEXT CHARGE (when/how much leaves next), and WHAT YOU
// PAY (the two independent recurring clocks, never summed). An info banner explains the per-product
// cadence model below the columns.
export const BillingHeaderCard = ({ overview, catalog }: BillingHeaderCardProps) => {
  const { billing } = overview;
  const { nextCharge } = billing;
  const productLabel = nextCharge ? nextChargeProductLabel(catalog, nextCharge.productKeys) : "";
  const nextChargeCadence = nextCharge ? cadenceLabel(nextCharge.cadence) : "";
  const nextChargeSubline = [productLabel, nextChargeCadence].filter(Boolean).join(" · ");
  const hasRecurring = billing.monthlyRecurring > 0 || billing.annualCommitted > 0;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0">
        <HeaderColumn label="Account">
          <div>
            <StatusBadge subState={overview.subState} />
          </div>
          <div className="text-xs text-muted">
            {billing.activeProductCount} active{" "}
            {billing.activeProductCount === 1 ? "product" : "products"}
          </div>
        </HeaderColumn>

        <HeaderColumn label="Next charge">
          {nextCharge ? (
            <>
              <div className="text-2xl font-semibold text-foreground">
                {fmtMoney(nextCharge.amount)}{" "}
                <span className="text-base text-muted">on {nextCharge.at}</span>
              </div>
              <div className="text-xs text-muted">
                {nextChargeSubline}
                {nextCharge.hasUsage && " · plus usage"}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">No upcoming charge</div>
          )}
        </HeaderColumn>

        <HeaderColumn label="What you pay">
          {hasRecurring ? (
            <div className="flex flex-col gap-1.5">
              {billing.monthlyRecurring > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold text-foreground">
                    {fmtMoney(billing.monthlyRecurring)}
                  </span>
                  <span className="text-xs text-muted">/ mo recurring</span>
                  <Badge variant="info">Monthly</Badge>
                </div>
              )}
              {billing.annualCommitted > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold text-foreground">
                    {fmtMoney(billing.annualCommitted)}
                  </span>
                  <span className="text-xs text-muted">/ yr committed</span>
                  <Badge variant="warning">Annual</Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xl font-semibold text-foreground">Free</div>
          )}
        </HeaderColumn>
      </div>

      <div className="flex items-start gap-2.5 border-t border-border px-6 py-4 text-xs text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          Each product bills on its own cadence. Monthly plans charge on their renewal day; annual
          plans are committed upfront, with usage above the commitment billed monthly on-demand.
        </span>
      </div>
    </Card>
  );
};
