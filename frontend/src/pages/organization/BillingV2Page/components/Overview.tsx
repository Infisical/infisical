import { ReactNode, useState } from "react";
import {
  ArrowBigUpDashIcon,
  Building2,
  CircleAlert,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
  type LucideIcon,
  Package,
  ReceiptText,
  RefreshCw,
  TriangleAlert
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2Invoice,
  BillingV2Overview
} from "@app/hooks/api";

import { byDisplayOrder, fmtMoney, productAnnualCommitted } from "../billing-v2-data";
import { ActiveBadge, CadenceBadge, DimensionMeter, ProductIcon } from "./shared";

export type BillingV2Mode = "self-serve" | "managed";
export type BillingV2RenderState =
  | "active"
  | "trialing"
  | "past-due"
  | "suspended"
  | "no-subscription"
  | "loading"
  | "error";

type BannerProps = {
  mode: BillingV2Mode;
  subState: BillingV2RenderState;
  canManage: boolean;
  onUpdatePayment: () => void;
  onManageSubscription: () => void;
};

type Dunning = {
  variant: "warning" | "danger";
  icon: LucideIcon;
  title: string;
  body: string;
};

const DUNNING: Partial<Record<BillingV2RenderState, Dunning>> = {
  "past-due": {
    variant: "warning",
    icon: TriangleAlert,
    title: "We couldn't process your last payment",
    body: "Update your payment method to avoid losing access. Your products are still active while we retry."
  },
  suspended: {
    variant: "danger",
    icon: CircleAlert,
    title: "Your subscription is suspended",
    body: "A payment kept failing and access is paused. Complete payment to restore access to your products."
  }
};

const Banner = ({
  mode,
  subState,
  canManage,
  onUpdatePayment,
  onManageSubscription
}: BannerProps) => {
  if (mode === "managed") {
    return (
      <Alert variant="info">
        <Info />
        <AlertTitle>Your plan is managed by your account team</AlertTitle>
        <AlertDescription>
          Products and limits on this organization are set by contract. Contact your account manager
          to make changes.
        </AlertDescription>
      </Alert>
    );
  }

  const dunning = DUNNING[subState];
  if (!dunning) {
    return null;
  }

  const DunningIcon = dunning.icon;
  return (
    <Alert variant={dunning.variant}>
      <DunningIcon />
      <AlertTitle>{dunning.title}</AlertTitle>
      <AlertDescription>
        {dunning.body}
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={dunning.variant} size="sm" onClick={onUpdatePayment}>
              <CreditCard />
              Update payment method
            </Button>
            <Button variant="outline" size="sm" onClick={onManageSubscription}>
              Manage subscription
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};

type CardEmptyProps = {
  title: string;
  description?: ReactNode;
};

const CardEmpty = ({ title, description }: CardEmptyProps) => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
    </EmptyHeader>
  </Empty>
);

const OverviewSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 lg:flex-row">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex-1 gap-2 p-4 shadow-none">
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-3 w-16" />
            </CardTitle>
            <CardAction>
              <Skeleton className="size-7 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-4 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-border py-4 first:border-t-0"
          >
            <Skeleton className="size-[38px] rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);

type ErrorPanelProps = {
  onRetry: () => void;
};

const ErrorPanel = ({ onRetry }: ErrorPanelProps) => (
  <Card>
    <div className="flex flex-col items-center gap-3 px-7 py-10 text-center">
      <CircleAlert className="size-8 text-danger" />
      <div className="text-base font-semibold text-foreground">
        Couldn&apos;t load your subscription
      </div>
      <div className="max-w-[40ch] text-sm text-accent">
        There was a problem reaching the billing service. Your products are unaffected.
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        Try again
      </Button>
    </div>
  </Card>
);

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

// Resolve the product(s) closing on the next-charge date into a display label. A single product reads
// as its name; several collapse to "{first} + N more" so the line stays short.
const nextChargeProductLabel = (
  catalog: BillingV2CatalogProduct[],
  productKeys: string[]
): string => {
  const names = productKeys.map((key) => catalog.find((prod) => prod.id === key)?.name ?? key);
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} + ${names.length - 1} more`;
};

const cadenceWordFor = (cadence: BillingV2Cadence | null): string => {
  if (cadence === "annual") {
    return "annual";
  }
  if (cadence === "monthly") {
    return "monthly";
  }
  return "";
};

type BillingHeaderCardProps = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
};

// The three-column header: ACCOUNT (standing), NEXT CHARGE (when/how much leaves next), and WHAT YOU
// PAY (the two independent recurring clocks, never summed). An info banner explains the per-product
// cadence model below the columns.
const BillingHeaderCard = ({ overview, catalog }: BillingHeaderCardProps) => {
  const { billing } = overview;
  const { nextCharge } = billing;
  const productLabel = nextCharge ? nextChargeProductLabel(catalog, nextCharge.productKeys) : "";
  const nextChargeCadence = nextCharge ? cadenceWordFor(nextCharge.cadence) : "";
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

// Capitalize a plan tier ("pro" -> "Pro") for the badge beside an active product's name.
const tierLabel = (tier: string): string => tier.charAt(0).toUpperCase() + tier.slice(1);

type Deprecation = NonNullable<BillingV2Entitlement["deprecation"]>;

// Concise, single-line deprecation summary for the product row. The full reason/nextSteps live in the
// top banner + its "See what changes" dialog, so this stays short and truncates rather than wrapping.
const deprecationSubline = (deprecation: Deprecation, planTier?: string): string => {
  if (deprecation.kind === "product") {
    return deprecation.date ? `Discontinued — access ends ${deprecation.date}` : "Discontinued";
  }
  const tier = planTier ? tierLabel(planTier) : "This plan";
  const base = deprecation.date
    ? `${tier} plan retires ${deprecation.date}`
    : `${tier} plan is retiring`;
  return deprecation.nextSteps ? `${base} · ${deprecation.nextSteps}` : base;
};

type ProductRowProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ProductRow = ({ prod, entitlement, readOnly, onManage, onContact }: ProductRowProps) => {
  const entitled = Boolean(entitlement?.entitled);
  const selfServe = prod.plans.some((plan) => plan.selfServe);
  const salesLed = prod.plans.some((plan) => plan.salesLed);
  const deprecation = entitlement?.deprecation;
  const isProductDeprecated = deprecation?.kind === "product";
  const isPlanDeprecated = deprecation?.kind === "plan";

  let action = null;
  if (!readOnly) {
    if (entitled) {
      // A retiring plan nudges the customer toward the replacement; everything else opens Manage.
      action = (
        <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
          {isPlanDeprecated ? "Review plan" : "Manage"}
        </Button>
      );
    } else if (selfServe) {
      action = (
        <Button variant="org" size="sm" onClick={() => onManage(prod.id)}>
          <ArrowBigUpDashIcon />
          Activate
        </Button>
      );
    } else if (salesLed) {
      action = (
        <Button variant="org" size="sm" onClick={() => onContact(prod)}>
          Contact sales
        </Button>
      );
    }
  }

  // Inactive product: compact row with the tagline and an activate / contact action.
  if (!entitled) {
    return (
      <div className="flex items-center gap-4 border-t border-border py-4 first:border-t-0">
        <ProductIcon product={prod} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{prod.name}</span>
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            <Badge variant="neutral">Inactive</Badge>
          </div>
          <div className="text-xs text-muted">{prod.tagline}</div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
    );
  }

  // Active product: cadence badge, renewal (or trial) line, and the price as two independent clocks
  // (never summed) — the annual prepaid commitment and the monthly charge — plus one bar per dimension.
  const dims = entitlement?.dimensions ?? [];
  const onDemand = entitlement?.onDemandAmount ?? 0;
  const annualCommitted = productAnnualCommitted(entitlement);
  // Monthly recurring applies to non-annual products (item.amount is their monthly charge); an annual
  // product carries no monthly recurring, only optional usage-driven on-demand overage.
  const monthlyRecurring = entitlement?.cadence === "annual" ? 0 : (entitlement?.amount ?? 0);
  const hasPrice = annualCommitted > 0 || monthlyRecurring > 0 || onDemand > 0;
  const isTrialing = Boolean(entitlement?.isTrialing);

  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0">
      <div className="flex items-center gap-4">
        {/* A discontinued product's icon is dimmed so a glance down the list reads it as winding down. */}
        <div className={isProductDeprecated ? "opacity-40 grayscale" : undefined}>
          <ProductIcon product={prod} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{prod.name}</span>
            {/* Plan retiring: strikethrough tier chip in warning tone. Otherwise the plain tier chip. */}
            {entitlement?.planTier &&
              (isPlanDeprecated ? (
                <Badge variant="warning" className="line-through">
                  {tierLabel(entitlement.planTier)}
                </Badge>
              ) : (
                <Badge variant="neutral">{tierLabel(entitlement.planTier)}</Badge>
              ))}
            {isProductDeprecated && <Badge variant="danger">Deprecated</Badge>}
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            {isTrialing ? <Badge variant="info">Trial</Badge> : <ActiveBadge />}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
            {deprecation ? (
              <span
                className={cn("truncate", isProductDeprecated ? "text-danger" : "text-warning")}
              >
                {deprecationSubline(deprecation, entitlement?.planTier)}
              </span>
            ) : (
              <>
                {!isTrialing && <CadenceBadge cadence={entitlement?.cadence} />}
                {isTrialing && entitlement?.trialEndsAt ? (
                  <span>Trial ends {entitlement.trialEndsAt}</span>
                ) : (
                  entitlement?.renewsOn && <span>Renews {entitlement.renewsOn}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {annualCommitted > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {fmtMoney(annualCommitted)}
              </span>
              <span className="text-xs text-muted">/ yr </span>
            </div>
          )}
          {monthlyRecurring > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {fmtMoney(monthlyRecurring)}
              </span>
              <span className="text-xs text-muted">/ mo</span>
            </div>
          )}
          {onDemand > 0 && (
            <span className="text-xs font-medium text-warning">
              + {fmtMoney(onDemand)} / mo on-demand
            </span>
          )}
          {!hasPrice && <span className="text-sm text-muted">Included</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {dims.length > 0 && (
        <div className="flex flex-col gap-3 pl-[52px]">
          {dims.map((dim) => (
            <DimensionMeter key={dim.key} dim={dim} />
          ))}
        </div>
      )}
    </div>
  );
};

type ProductsCardProps = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ProductsCard = ({ overview, catalog, readOnly, onManage, onContact }: ProductsCardProps) => {
  // A deprecated product stays visible to existing subscribers but is closed to new ones, so hide it
  // from anyone who isn't already entitled to it (plan-level deprecation still shows the product).
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || overview.entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Package className="size-4 text-accent" />
          Products
        </CardTitle>
        <CardDescription>Everything you can run on your subscription.</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <CardEmpty
            title="No products available"
            description="Products will appear here once they're available."
          />
        ) : (
          <div className="flex flex-col">
            {visible.map((prod) => (
              <ProductRow
                key={prod.id}
                prod={prod}
                entitlement={overview.entitlements[prod.id]}
                readOnly={readOnly}
                onManage={onManage}
                onContact={onContact}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

type PaymentCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onUpdate: () => void;
};

const PaymentCard = ({ overview, canManage, onUpdate }: PaymentCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <CreditCard className="size-4 text-accent" />
        Payment Method
      </CardTitle>
      {canManage && (
        <CardAction>
          <Button variant="outline" size="sm" onClick={onUpdate}>
            Update
          </Button>
        </CardAction>
      )}
    </CardHeader>
    <CardContent>
      {overview.payment ? (
        <div className="flex items-center gap-3.5">
          <div className="flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-sm border border-border bg-container text-[10px] font-bold tracking-wide text-foreground">
            {overview.payment.brand.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Expires {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
              {String(overview.payment.expYear).slice(-2)}
            </div>
          </div>
        </div>
      ) : (
        <CardEmpty
          title="No payment method"
          description="You haven't added a payment method yet."
        />
      )}
    </CardContent>
  </Card>
);

type DetailsCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onEdit: () => void;
};

type BillingAddress = NonNullable<BillingV2Overview["billingDetails"]>["address"];

// Resolve a 2-letter ISO country code to its English name, falling back to the raw value.
const countryName = (code: string): string => {
  if (code.length !== 2) {
    return code;
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

// Collapse a Stripe address into display lines, dropping any empty field.
const formatAddressLines = (address: BillingAddress): string[] => {
  if (!address) {
    return [];
  }
  const regionLine = [address.city, [address.state, address.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [
    address.line1,
    address.line2,
    regionLine,
    address.country ? countryName(address.country) : ""
    // type-guard predicate (not bare Boolean) so the nullable sub-fields narrow to string[].
  ].filter((line): line is string => Boolean(line));
};

// Friendly labels for common Stripe tax-id types; falls back to the upper-cased raw type.
const TAX_TYPE_LABELS: Record<string, string> = {
  eu_vat: "EU VAT",
  gb_vat: "UK VAT",
  ch_vat: "CH VAT",
  no_vat: "NO VAT",
  in_gst: "GSTIN",
  au_abn: "ABN",
  nz_gst: "NZ GST",
  ca_gst_hst: "GST/HST",
  us_ein: "US EIN"
};
const taxTypeLabel = (type: string): string =>
  TAX_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toUpperCase();

const DetailField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-1 text-xs text-label">{label}</div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

const DetailsCard = ({ overview, canManage, onEdit }: DetailsCardProps) => {
  const addressLines = formatAddressLines(overview.billingDetails?.address ?? null);
  const taxIds = overview.billingDetails?.taxIds ?? [];
  const hasAddress = addressLines.length > 0;
  const hasTaxIds = taxIds.length > 0;
  const emptyDash = <span className="text-muted">—</span>;
  const name = overview.billingDetails?.name || emptyDash;
  const email = overview.billingDetails?.email || emptyDash;
  // Responsive (keyed off the card's own width via @container, not the viewport, since the sidebar
  // changes how much room the card has): stack to one column when narrow, then two, then three.
  // The third column is the tax ID, so it only appears when one is present.
  const gridCols = hasTaxIds
    ? "grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3"
    : "grid-cols-1 @lg:grid-cols-2";

  const nameEmailFields = (
    <>
      <DetailField label="Billing Name">{name}</DetailField>
      <DetailField label="Billing Email">{email}</DetailField>
    </>
  );

  const taxIdField = hasTaxIds ? (
    <DetailField label="Tax ID">
      {taxIds.map((taxId) => (
        <div key={`${taxId.type}-${taxId.value}`}>
          {taxId.value} <span className="text-muted">({taxTypeLabel(taxId.type)})</span>
        </div>
      ))}
    </DetailField>
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 className="size-4 text-accent" />
          Billing Details
        </CardTitle>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="@container">
        {overview.billingDetails ? (
          <div className={cn("grid gap-x-8 gap-y-5", gridCols)}>
            {hasAddress ? (
              <>
                <div className="flex flex-col gap-4">{nameEmailFields}</div>
                <DetailField label="Billing Address">
                  {addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </DetailField>
                {taxIdField}
              </>
            ) : (
              <>
                {nameEmailFields}
                {taxIdField}
              </>
            )}
          </div>
        ) : (
          <CardEmpty
            title="No billing details"
            description="Your billing name, email, and address will appear here once added."
          />
        )}
      </CardContent>
    </Card>
  );
};

type InvoicesCardProps = {
  invoices: BillingV2Invoice[];
};

const InvoicesCard = ({ invoices }: InvoicesCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <ReceiptText className="size-4 text-accent" />
        Invoices
      </CardTitle>
    </CardHeader>
    <CardContent>
      {invoices.length === 0 ? (
        <CardEmpty
          title="No invoices yet"
          description="Your first invoice appears after your next billing date."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.date}</TableCell>
                <TableCell className="tabular-nums">{fmtMoney(inv.amount, 2)}</TableCell>
                <TableCell>
                  {inv.paid ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <Badge variant="danger">Unpaid</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {inv.pdfUrl ? (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline"
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      PDF
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

type DeprecatedEntry = {
  productId: string;
  name: string;
  planTier?: string;
  deprecation: Deprecation;
};

const DEPRECATION_TONE = {
  warning: {
    container: "border-warning/30 bg-warning/[0.04]",
    iconBox: "border-warning/20 bg-warning/10 text-warning",
    pill: "border-warning/20 bg-warning/[0.06]",
    chip: "border border-warning/30 bg-warning/10 text-warning"
  },
  danger: {
    container: "border-danger/30 bg-danger/[0.04]",
    iconBox: "border-danger/20 bg-danger/10 text-danger",
    pill: "border-danger/20 bg-danger/[0.06]",
    chip: "border border-danger/30 bg-danger/10 text-danger"
  }
};

const daysLeftLabel = (daysLeft: number | null): string | null => {
  if (daysLeft === null) {
    return null;
  }
  return `${daysLeft.toLocaleString()} ${daysLeft === 1 ? "day" : "days"} left`;
};

// Rich "See what changes" dialog body: an icon + title/subtitle header, the sunset date as a pill with
// a day-countdown chip, then the full (untruncated) reason and next-steps sections.
const DeprecationDetailBody = ({ entry }: { entry: DeprecatedEntry }) => {
  const { deprecation, name, planTier } = entry;
  const isProduct = deprecation.kind === "product";
  const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
  const tone = DEPRECATION_TONE[isProduct || urgent ? "danger" : "warning"];
  const label = daysLeftLabel(deprecation.daysLeft);
  const title = isProduct
    ? `${name} is being discontinued`
    : `The ${planTier ? tierLabel(planTier) : "current"} plan is being retired`;
  const subtitle = isProduct
    ? "This product is winding down"
    : `${planTier ? tierLabel(planTier) : "Current"} plan · ${name}`;

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4",
              tone.iconBox
            )}
          >
            {isProduct ? <CircleAlert /> : <TriangleAlert />}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <span className="truncate text-xs text-muted">{subtitle}</span>
          </div>
        </div>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {deprecation.date && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
              tone.pill
            )}
          >
            <Clock className="size-4 text-muted" />
            <span className="text-sm text-foreground">
              {isProduct ? "Access ends" : "Retires"}{" "}
              <span className="font-medium">{deprecation.date}</span>
            </span>
            {label && (
              <span
                className={cn("ml-auto rounded-md px-1.5 py-0.5 text-xs font-medium", tone.chip)}
              >
                {label}
              </span>
            )}
          </div>
        )}
        {deprecation.reason && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Why</span>
            <p className="text-sm text-foreground">{deprecation.reason}</p>
          </div>
        )}
        {deprecation.nextSteps && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
              What to do
            </span>
            <p className="text-sm text-foreground">{deprecation.nextSteps}</p>
          </div>
        )}
      </div>
    </>
  );
};

// Attention banners above the summary, one per affected product. A retiring plan reads forward-looking
// in warning tone; a discontinued product reads terminal in danger tone, escalating warning→danger
// inside the final window. Concise here with a "See what changes" detail dialog for the full copy.
// Products sort terminal-first, then most-urgent-first.
const DeprecationBanners = ({
  overview,
  catalog,
  onManage,
  onContact
}: {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => {
  const [detail, setDetail] = useState<DeprecatedEntry | null>(null);

  const entries: DeprecatedEntry[] = Object.entries(overview.entitlements)
    .filter(([, entitlement]) => Boolean(entitlement.deprecation))
    .map(([productId, entitlement]) => ({
      productId,
      name: catalog.find((prod) => prod.id === productId)?.name ?? productId,
      planTier: entitlement.planTier,
      deprecation: entitlement.deprecation as Deprecation
    }))
    .sort((a, b) => {
      const rank = (entry: DeprecatedEntry) => (entry.deprecation.kind === "product" ? 0 : 1);
      if (rank(a) !== rank(b)) {
        return rank(a) - rank(b);
      }
      return (a.deprecation.daysLeft ?? Infinity) - (b.deprecation.daysLeft ?? Infinity);
    });

  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      {entries.map((entry) => {
        const { deprecation, name, planTier, productId } = entry;
        const isProduct = deprecation.kind === "product";
        // Plan retirement escalates from warning to danger once inside the final two-week window.
        const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
        const variant = isProduct || urgent ? "danger" : "warning";
        const catalogProduct = catalog.find((prod) => prod.id === productId);
        const label = daysLeftLabel(deprecation.daysLeft);
        const title = isProduct
          ? `${name} is being discontinued`
          : `The ${planTier ? tierLabel(planTier) : "current"} plan for ${name} is being retired`;
        const lead = isProduct
          ? `This product will stop working${deprecation.date ? ` on ${deprecation.date}` : ""}.`
          : deprecation.nextSteps || deprecation.reason || "";
        const hasDetail = Boolean(deprecation.reason || deprecation.nextSteps || deprecation.date);

        return (
          <Alert key={productId} variant={variant}>
            {isProduct ? <CircleAlert /> : <TriangleAlert />}
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>
              <span className="line-clamp-2">
                {lead}
                {label && (
                  <>
                    {" — "}
                    <span className="font-medium">{label}</span>
                  </>
                )}
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                {isProduct ? (
                  catalogProduct && (
                    <Button variant="danger" size="sm" onClick={() => onContact(catalogProduct)}>
                      Contact support
                    </Button>
                  )
                ) : (
                  <Button variant="outline" size="sm" onClick={() => onManage(productId)}>
                    Review plan
                  </Button>
                )}
                {hasDetail && (
                  <Button variant="ghost" size="sm" onClick={() => setDetail(entry)}>
                    See what changes
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        );
      })}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && <DeprecationDetailBody entry={detail} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export type OverviewProps = {
  overview?: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  subState: BillingV2RenderState;
  onManageSubscription: () => void;
  onUpgrade: (productId: string) => void;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
  onRetry: () => void;
  canManageBilling: boolean;
};

export const Overview = ({
  overview,
  catalog,
  subState,
  onManageSubscription,
  onUpgrade,
  onUpdatePayment,
  onEditDetails,
  onContact,
  onRetry,
  canManageBilling
}: OverviewProps) => {
  if (subState === "loading") {
    return <OverviewSkeleton />;
  }

  if (subState === "error" || !overview) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorPanel onRetry={onRetry} />
      </div>
    );
  }

  const { mode } = overview;
  const isManaged = mode === "managed";
  // Managed plans and read-only billing roles cannot mutate the subscription.
  const productsReadOnly = isManaged || !canManageBilling;

  if (subState === "no-subscription") {
    return (
      <div className="flex flex-col gap-4">
        <Banner
          mode={mode}
          subState={subState}
          canManage={canManageBilling}
          onUpdatePayment={onUpdatePayment}
          onManageSubscription={onManageSubscription}
        />
        <ProductsCard
          overview={overview}
          catalog={catalog}
          readOnly={productsReadOnly}
          onManage={onUpgrade}
          onContact={onContact}
        />
      </div>
    );
  }

  const showPayment = overview.isCloud && !isManaged;

  return (
    <div className="flex flex-col gap-4">
      <Banner
        mode={mode}
        subState={subState}
        canManage={canManageBilling}
        onUpdatePayment={onUpdatePayment}
        onManageSubscription={onManageSubscription}
      />
      <DeprecationBanners
        overview={overview}
        catalog={catalog}
        onManage={onUpgrade}
        onContact={onContact}
      />
      <BillingHeaderCard overview={overview} catalog={catalog} />
      <ProductsCard
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        onManage={onUpgrade}
        onContact={onContact}
      />
      {showPayment && (
        <PaymentCard overview={overview} canManage={canManageBilling} onUpdate={onUpdatePayment} />
      )}
      {!isManaged && (
        <DetailsCard overview={overview} canManage={canManageBilling} onEdit={onEditDetails} />
      )}
      {showPayment && <InvoicesCard invoices={overview.invoices} />}
    </div>
  );
};
