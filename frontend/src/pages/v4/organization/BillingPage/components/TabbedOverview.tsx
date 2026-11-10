import { type ReactNode, useState } from "react";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_CONTACT_SALES_URL,
  SELF_HOSTED_LICENSE_COPY,
  SELF_HOSTED_LICENSE_DOCS_URL
} from "@app/components/license/self-hosted-license";
import {
  CertificateManagementUpgradeIntent,
  PamUpgradeIntent,
  SecretsManagementUpgradeIntent,
  type UpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Heading } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingOverview
} from "@app/hooks/api/billing/types";

import { useOrgId } from "../../../access/permissions";
import { toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import {
  byDisplayOrder,
  cadenceLabel,
  fmtMoney,
  fmtMoneyCents,
  nextChargeProductLabel
} from "../billing-format";
import { DetailsSheet, InvoicesSheet, PaymentSheet } from "./BillingSheets";
import { InactiveProductCard } from "./InactiveProductCard";
import { OrganizationFeatures } from "./OrganizationFeatures";
import { useBillingSubscription } from "./shared";
import { SubscriptionsTable } from "./SubscriptionsTable";

import styles from "./billing.module.css";

const PRODUCT_UPGRADE_INTENTS: Record<string, UpgradeIntent> = {
  [CertificateManagementUpgradeIntent.productKey]: CertificateManagementUpgradeIntent,
  [PamUpgradeIntent.productKey]: PamUpgradeIntent,
  [SecretsManagementUpgradeIntent.productKey]: SecretsManagementUpgradeIntent
};

const ACCOUNT_STATUS = {
  "past-due": { label: "Past due", tone: "warn" },
  suspended: { label: "Suspended", tone: "bad" }
} as const;

export const TabbedOverviewSkeleton = ({ orgFilter }: { orgFilter?: ReactNode }) => (
  <Stack gap={24}>
    {orgFilter}
    <Card>
      <Inline gap={48}>
        <Stack gap={8}>
          <Skeleton width={80} height={12} />
          <Skeleton width={160} height={20} />
        </Stack>
        <Stack gap={8}>
          <Skeleton width={96} height={12} />
          <Skeleton width={120} height={20} />
        </Stack>
      </Inline>
    </Card>
    <Card variant="framed" title="Subscriptions">
      <Stack gap={12}>
        <Skeleton height={36} />
        <Skeleton height={36} />
      </Stack>
    </Card>
  </Stack>
);

const Figure = ({
  label,
  info,
  children
}: {
  label: ReactNode;
  info?: ReactNode;
  children: ReactNode;
}) => (
  <Stack gap={4}>
    <Inline gap={8} wrap={false}>
      <span className={styles.secondary}>{label}</span>
    </Inline>
    <Inline gap={8} wrap={false} align="end">
      <Heading level={3} size="subsection" className={styles.numeric}>
        {children}
      </Heading>
      {info}
    </Inline>
  </Stack>
);

const InfoTip = ({ label, content }: { label: string; content: ReactNode }) => (
  <Tooltip content={content}>
    <Button variant="ghost" size="icon-xs" icon="info" iconOnly>
      {label}
    </Button>
  </Tooltip>
);

const SummaryTile = ({
  label,
  onClick,
  href,
  children
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) => {
  const body = (
    <>
      <span className={styles.secondary}>{label}</span>
      <span className={styles.spread}>
        <span className={styles.truncate}>{children}</span>
        {(href || onClick) && <Icon name={href ? "external" : "chev-right"} size={14} />}
      </span>
    </>
  );
  if (href) {
    return (
      <a className={styles.tile} href={href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={styles.tile} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={styles.tile}>{body}</div>;
};

type TabbedOverviewProps = {
  overview: BillingOverview;
  catalog: BillingCatalogProduct[];
  readOnly: boolean;
  canManageBilling: boolean;
  orgFilter?: ReactNode;
  breakdownOrgId: string;
  breakdownScope: BillingBreakdownScopeKind;
  onManage: (productId: string) => void;
  onRemove: (productId: string) => void;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingCatalogProduct) => void;
};

export const TabbedOverview = ({
  overview,
  catalog,
  readOnly,
  canManageBilling,
  orgFilter,
  breakdownOrgId,
  breakdownScope,
  onManage,
  onRemove,
  onUpdatePayment,
  onEditDetails,
  onContact
}: TabbedOverviewProps) => {
  const orgId = useOrgId();
  const subscription = useBillingSubscription();
  const licenseCopy = SELF_HOSTED_LICENSE_COPY[getSelfHostedLicenseState(subscription)];
  const refreshEntitlements = useV4Adapter("billing").useRefreshEntitlements();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [openSheet, setOpenSheet] = useState<"payment" | "invoices" | "details" | null>(null);
  const { billing, entitlements } = overview;
  const isManaged = overview.mode === "managed";
  const isSubscribed = overview.subState !== "no-subscription";
  const hasBillingHistory =
    Boolean(overview.payment) || Boolean(overview.billingDetails) || overview.invoices.length > 0;
  const showPayment = overview.isCloud && !isManaged;
  const showInvoices = showPayment && (isSubscribed || overview.invoices.length > 0);
  const showBillingInfo = !isManaged && (isSubscribed || hasBillingHistory);
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const isActiveProduct = (productId: string) =>
    Boolean(entitlements[productId]?.entitled) && entitlements[productId]?.status !== "churned";
  const activeProducts = visible.filter((prod) => isActiveProduct(prod.id));
  const inactiveProducts = visible.filter((prod) => !isActiveProduct(prod.id));
  const accountStatus =
    overview.subState in ACCOUNT_STATUS
      ? ACCOUNT_STATUS[overview.subState as keyof typeof ACCOUNT_STATUS]
      : null;
  const { nextCharge } = billing;
  const trials = visible
    .filter((prod) => {
      const ent = entitlements[prod.id];
      return (
        isActiveProduct(prod.id) && ent?.isTrialing && ent.trialEndsAt && !ent.trialPaymentDueAt
      );
    })
    .map((prod) => ({ name: prod.name, endsAt: entitlements[prod.id]?.trialEndsAt ?? "" }))
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
  let trialNote: string | null = null;
  if (trials.length === 1) {
    trialNote = `${trials[0].name} trial ends ${trials[0].endsAt}`;
  } else if (trials.length > 1) {
    trialNote = `${trials.length} trials, first ends ${trials[0].endsAt}`;
  }
  const accountTeamNote =
    !isManaged && !overview.selfServe
      ? {
          label: "Managed billing",
          detail:
            "Contact your Infisical account manager to adjust products, commitments, or your subscription."
        }
      : null;

  const handleRefresh = () => {
    refreshEntitlements.mutate(
      { orgId },
      { onSuccess: () => toast({ tone: "ok", title: "Entitlements refreshed." }) }
    );
  };

  let summaryLeft: ReactNode;
  if (isManaged) {
    summaryLeft = (
      <Figure
        label="Billing method"
        info={<InfoTip label="About this license" content={licenseCopy.detail} />}
      >
        {licenseCopy.method}
      </Figure>
    );
  } else if (!isSubscribed && !trialNote) {
    summaryLeft = (
      <Stack gap={4}>
        <span className={styles.secondary}>Subscription</span>
        <Inline gap={8} align="end">
          <Heading level={3} size="subsection">
            None
          </Heading>
          <span className={styles.secondary}>
            {visible.some(
              (prod) =>
                !entitlements[prod.id]?.entitled || entitlements[prod.id]?.status === "churned"
            )
              ? "Activate a product to start one"
              : "No products to activate"}
          </span>
        </Inline>
      </Stack>
    );
  } else {
    const chargeDetail = nextCharge
      ? [nextChargeProductLabel(catalog, nextCharge.productKeys), cadenceLabel(nextCharge.cadence)]
          .filter(Boolean)
          .join(", ")
      : "";
    const estimatedUsage = nextCharge?.estimatedUsage ?? 0;
    summaryLeft = (
      <Inline gap={48} align="start">
        <Stack gap={4}>
          <Figure
            label={
              <Inline gap={8}>
                Upcoming bill
                {accountStatus && (
                  <Badge size="sm" tone={accountStatus.tone}>
                    {accountStatus.label}
                  </Badge>
                )}
              </Inline>
            }
            info={
              nextCharge &&
              (chargeDetail || overview.onDemandAmount > 0) && (
                <InfoTip
                  label="Next charge details"
                  content={
                    <Stack gap={4}>
                      {chargeDetail && <span>{chargeDetail}</span>}
                      {nextCharge.hasUsage && (
                        <span>
                          {estimatedUsage > 0
                            ? "Usage is estimated from this period so far and billed when the period ends"
                            : "Estimate includes usage to date"}
                        </span>
                      )}
                      {overview.onDemandAmount > 0 && (
                        <span>+{fmtMoneyCents(overview.onDemandAmount)} on-demand this period</span>
                      )}
                    </Stack>
                  }
                />
              )
            }
          >
            {nextCharge ? fmtMoney(nextCharge.amount, 2, 2) : "Nothing due"}
            {nextCharge && estimatedUsage > 0 && (
              <span className={styles.secondary}>
                {" "}
                + est. {fmtMoneyCents(estimatedUsage)} usage
              </span>
            )}
          </Figure>
          {trialNote && <span className={styles.secondary}>{trialNote}</span>}
        </Stack>
        {nextCharge && <Figure label="Next billing date">{nextCharge.at}</Figure>}
      </Inline>
    );
  }

  const latestInvoice = overview.invoices[0];
  const tiles: ReactNode[] = [];
  if (isManaged) {
    tiles.push(
      <SummaryTile key="products" label="Products">
        {billing.activeProductCount.toLocaleString()} active
      </SummaryTile>,
      <SummaryTile key="license" label="License" href={SELF_HOSTED_LICENSE_DOCS_URL}>
        {licenseCopy.methodHint}
      </SummaryTile>,
      <SummaryTile key="plan" label="Plan changes" href={SELF_HOSTED_CONTACT_SALES_URL}>
        Contact sales
      </SummaryTile>
    );
  }
  if (showPayment && showBillingInfo) {
    tiles.push(
      <SummaryTile key="card" label="Card on file" onClick={() => setOpenSheet("payment")}>
        {overview.payment
          ? `${overview.payment.brand.toUpperCase()} ending in ${overview.payment.last4}`
          : "Not added"}
      </SummaryTile>
    );
  }
  if (showInvoices) {
    let invoiceSummary = "None yet";
    if (latestInvoice) {
      invoiceSummary = `${fmtMoneyCents(latestInvoice.amount)}, ${
        latestInvoice.paid || latestInvoice.amount < 0 ? latestInvoice.date : "unpaid"
      }`;
    }
    tiles.push(
      <SummaryTile key="invoices" label="Invoices" onClick={() => setOpenSheet("invoices")}>
        {invoiceSummary}
      </SummaryTile>
    );
  }
  if (showBillingInfo) {
    tiles.push(
      <SummaryTile key="details" label="Billing details" onClick={() => setOpenSheet("details")}>
        {overview.billingDetails?.name || overview.billingDetails?.email || "Not added"}
      </SummaryTile>
    );
  }

  return (
    <Stack gap={24}>
      {upgradeGate}
      {orgFilter}
      <Card aria-label="Billing summary">
        <Stack gap={16}>
          <div className={styles.summaryHead}>
            {summaryLeft}
            <Inline gap={8}>
              {accountTeamNote && (
                <Inline gap={4}>
                  <span className={styles.secondary}>{accountTeamNote.label}</span>
                  <InfoTip
                    label={`About ${accountTeamNote.label.toLowerCase()}`}
                    content={accountTeamNote.detail}
                  />
                </Inline>
              )}
              {!readOnly && (
                <Tooltip content="Plan changes may take a few minutes to take effect.">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    icon="sync"
                    iconOnly
                    loading={refreshEntitlements.isPending}
                    onClick={handleRefresh}
                  >
                    Refresh entitlements
                  </Button>
                </Tooltip>
              )}
            </Inline>
          </div>
          {tiles.length > 0 && <div className={styles.summaryTiles}>{tiles}</div>}
        </Stack>
      </Card>
      <OrganizationFeatures />

      {visible.length === 0 ? (
        <EmptyState
          title="No products available"
          description="Products will appear here once they're available."
        />
      ) : (
        <>
          {activeProducts.length > 0 && (
            <Card variant="framed" title="Subscriptions" flush>
              <SubscriptionsTable
                products={activeProducts}
                entitlements={entitlements}
                readOnly={readOnly}
                selfServe={overview.selfServe}
                isManaged={isManaged}
                breakdownOrgId={breakdownOrgId}
                breakdownScope={breakdownScope}
                onRemove={onRemove}
                onContact={onContact}
              />
            </Card>
          )}
          {inactiveProducts.length > 0 && (
            <Stack gap={12}>
              {activeProducts.length > 0 && (
                <Heading level={2} size="section">
                  {isManaged ? "Not in your license" : "Available products"}
                </Heading>
              )}
              <Grid columns={3} gap={16}>
                {inactiveProducts.map((prod) => (
                  <InactiveProductCard
                    key={prod.id}
                    prod={prod}
                    readOnly={readOnly}
                    isManaged={isManaged}
                    selfServe={overview.selfServe}
                    onManage={(productId) => {
                      const intent = PRODUCT_UPGRADE_INTENTS[productId];
                      const hasTrial = prod.plans.some(
                        (plan) => plan.selfServe && plan.trialable && plan.trialDays > 0
                      );
                      if (!intent || !hasTrial) {
                        onManage(productId);
                        return;
                      }
                      openUpgradeGate({
                        intent: { ...intent, upgradeLabel: `Try ${prod.name}` },
                        paywallKey: "billing-product-card"
                      });
                    }}
                    onContact={onContact}
                  />
                ))}
              </Grid>
            </Stack>
          )}
        </>
      )}

      {showPayment && showBillingInfo && (
        <PaymentSheet
          overview={overview}
          isOpen={openSheet === "payment"}
          onOpenChange={(isOpen) => setOpenSheet(isOpen ? "payment" : null)}
          canManage={canManageBilling}
          onUpdate={onUpdatePayment}
        />
      )}
      {showInvoices && (
        <InvoicesSheet
          overview={overview}
          isOpen={openSheet === "invoices"}
          onOpenChange={(isOpen) => setOpenSheet(isOpen ? "invoices" : null)}
        />
      )}
      {showBillingInfo && (
        <DetailsSheet
          overview={overview}
          isOpen={openSheet === "details"}
          onOpenChange={(isOpen) => setOpenSheet(isOpen ? "details" : null)}
          canManage={canManageBilling}
          onEdit={onEditDetails}
        />
      )}
    </Stack>
  );
};
