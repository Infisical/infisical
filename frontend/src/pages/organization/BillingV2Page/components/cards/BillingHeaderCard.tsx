import { ReactNode } from "react";
import { Calendar, CreditCard, Info, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge, Card, CardAction, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
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

type StatTone = "success" | "info" | "warning" | "danger" | "org";

const STAT_TONE: Record<StatTone, string> = {
  success: "border-success/15 bg-success/10 text-success",
  info: "border-info/15 bg-info/10 text-info",
  org: "border-org/15 bg-org/10 text-org",
  warning: "border-warning/15 bg-warning/10 text-warning",
  danger: "border-danger/15 bg-danger/10 text-danger"
};

const STATUS_VISUAL: Record<BillingV2RenderState, { tone: StatTone; icon: ReactNode }> = {
  active: { tone: "success", icon: <ShieldCheck /> },
  trialing: { tone: "info", icon: <ShieldCheck /> },
  "past-due": { tone: "warning", icon: <ShieldAlert /> },
  suspended: { tone: "danger", icon: <ShieldAlert /> },
  "no-subscription": { tone: "info", icon: <ShieldCheck /> },
  loading: { tone: "info", icon: <ShieldCheck /> },
  error: { tone: "danger", icon: <ShieldAlert /> }
};

type StatTileProps = {
  title: string;
  tone: StatTone;
  icon: ReactNode;
  value: ReactNode;
  footer: ReactNode;
};

const StatTile = ({ title, tone, icon, value, footer }: StatTileProps) => (
  <Card className="flex-1 gap-2 p-4 shadow-none">
    <CardHeader>
      <CardTitle className="text-xs font-medium text-muted capitalize">{title}</CardTitle>
      <CardAction>
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-md border [&>svg]:size-4",
            STAT_TONE[tone]
          )}
        >
          {icon}
        </div>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-1.5">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="flex min-h-5 items-center">{footer}</div>
    </CardContent>
  </Card>
);

type BillingHeaderCardProps = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
};

// Header stat tiles: Account (standing), Next charge, and What you pay (two independent recurring
// clocks, never summed), with an info note on the per-product cadence model below.
export const BillingHeaderCard = ({ overview, catalog }: BillingHeaderCardProps) => {
  const { billing } = overview;
  const { nextCharge } = billing;
  const status = STATUS_VISUAL[overview.subState];
  const productLabel = nextCharge ? nextChargeProductLabel(catalog, nextCharge.productKeys) : "";
  const nextChargeCadence = nextCharge ? cadenceLabel(nextCharge.cadence) : "";
  const nextChargeSubline = [productLabel, nextChargeCadence].filter(Boolean).join(" · ");
  const hasRecurring = billing.monthlyRecurring > 0 || billing.annualCommitted > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 lg:flex-row">
        <StatTile
          title="Account"
          tone={status.tone}
          icon={status.icon}
          value={<StatusBadge subState={overview.subState} />}
          footer={
            <span className="text-xs text-muted">
              {billing.activeProductCount} active{" "}
              {billing.activeProductCount === 1 ? "product" : "products"}
            </span>
          }
        />

        <StatTile
          title="Next charge"
          tone="org"
          icon={<Calendar />}
          value={
            nextCharge ? (
              <>
                {fmtMoney(nextCharge.amount)}{" "}
                <span className="text-sm font-normal text-muted">on {nextCharge.at}</span>
              </>
            ) : (
              "—"
            )
          }
          footer={
            <span className="text-xs text-muted">
              {nextCharge ? (
                <>
                  {nextChargeSubline}
                  {nextCharge.hasUsage && " · plus usage"}
                </>
              ) : (
                "No upcoming charge"
              )}
            </span>
          }
        />

        <StatTile
          title="What you pay"
          tone="org"
          icon={<CreditCard />}
          value={
            hasRecurring ? (
              <div className="flex flex-col gap-0.5">
                {billing.monthlyRecurring > 0 && (
                  <div>
                    {fmtMoney(billing.monthlyRecurring)}{" "}
                    <span className="text-sm font-normal text-muted">/ mo recurring</span>
                  </div>
                )}
                {billing.annualCommitted > 0 && (
                  <div>
                    {fmtMoney(billing.annualCommitted)}{" "}
                    <span className="text-sm font-normal text-muted">/ yr committed</span>
                  </div>
                )}
              </div>
            ) : (
              "Free"
            )
          }
          footer={
            hasRecurring ? (
              <div className="flex items-center gap-1.5">
                {billing.monthlyRecurring > 0 && <Badge variant="info">Monthly</Badge>}
                {billing.annualCommitted > 0 && <Badge variant="warning">Annual</Badge>}
              </div>
            ) : null
          }
        />
      </div>

      <div className="flex items-start gap-2 px-1 text-xs text-muted">
        <Info className="mt-[2px] size-3 shrink-0 text-muted" />
        <span>
          Each product bills on its own cadence. Monthly plans charge on their renewal day; annual
          plans are committed upfront, with usage above the commitment billed monthly on-demand.
        </span>
      </div>
    </div>
  );
};
