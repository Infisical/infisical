import { ReactNode } from "react";
import {
  ArrowBigUpDashIcon,
  Building2,
  Calendar,
  CircleAlert,
  CreditCard,
  ExternalLink,
  GaugeIcon,
  Info,
  type LucideIcon,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2Invoice,
  BillingV2Overview
} from "@app/hooks/api";

import { fmtMoney, intervalWord, pluralizeUnit } from "../billing-v2-data";
import { ActiveBadge, ProductIcon } from "./shared";

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

type SummaryCardProps = {
  overview: BillingV2Overview;
};

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

const recurringLabel = (overview: BillingV2Overview): string => {
  if (!overview.recurringAmount) {
    return "Free";
  }
  return `${fmtMoney(overview.recurringAmount)} / ${intervalWord(overview.interval)}`;
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

const SummaryCard = ({ overview }: SummaryCardProps) => {
  const status = STATUS_VISUAL[overview.subState];
  const recurringNote = overview.recurringAmount
    ? `Billed ${intervalWord(overview.interval)}ly`
    : "No recurring charges";

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <StatTile
        title="Status"
        tone={status.tone}
        icon={status.icon}
        value={overview.planName || "—"}
        footer={<StatusBadge subState={overview.subState} />}
      />
      <StatTile
        title="Next billing date"
        tone="org"
        icon={<Calendar />}
        value={overview.nextBillingDate || "—"}
        footer={<span className="text-xs text-muted">All products renew together</span>}
      />
      <StatTile
        title="Recurring total"
        tone="org"
        icon={<CreditCard />}
        value={recurringLabel(overview)}
        footer={<span className="text-xs text-muted">{recurringNote}</span>}
      />
    </div>
  );
};

type UsageCardProps = {
  overview: BillingV2Overview;
};

const UsageCard = ({ overview }: UsageCardProps) => {
  const { members, identities, identityLimit } = overview.usage;
  // Members and machine identities draw from one shared seat pool (identityLimit); there is no
  // separate member limit, so they're metered together against the single limit.
  const limit = identityLimit;
  const used = members + identities;
  const isUnlimited = limit === null;
  const available = isUnlimited ? 0 : Math.max(0, limit - used);
  const membersPct = limit ? Math.min(100, (members / limit) * 100) : 0;
  const identitiesPct = limit ? Math.min(100, (identities / limit) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GaugeIcon className="size-4 text-accent" />
          Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="text-sm font-medium text-foreground">
            Members &amp; machine identities
          </span>
          <span className="text-sm text-muted tabular-nums">
            <span className="text-foreground">{used.toLocaleString()}</span>
            {isUnlimited ? " used" : ` / ${limit.toLocaleString()} used`}
          </span>
        </div>

        {!isUnlimited && limit > 0 && (
          <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-org transition-all"
              style={{ width: `${membersPct}%` }}
            />
            <div
              className="h-full rounded-full bg-org/50 transition-all"
              style={{ width: `${identitiesPct}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-org" />
              <span className="text-muted">Members</span>
              <span className="font-medium text-foreground tabular-nums">
                {members.toLocaleString()}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-org/50" />
              <span className="text-muted">Machine identities</span>
              <span className="font-medium text-foreground tabular-nums">
                {identities.toLocaleString()}
              </span>
            </span>
          </div>
          <span className="shrink-0 text-muted tabular-nums">
            {isUnlimited ? "Unlimited" : `${available.toLocaleString()} available`}
          </span>
        </div>

        <div className="border-t border-border pt-3 text-xs text-muted">
          {isUnlimited
            ? "Members and machine identities share a single, unlimited pool."
            : `Members and machine identities share a single limit of ${limit.toLocaleString()}.`}
        </div>
      </CardContent>
    </Card>
  );
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
  let limitNote: string | null = null;
  if (entitled && entitlement && entitlement.limit !== null && entitlement.limit !== undefined) {
    const used = entitlement.used ?? 0;
    const unit = entitlement.unit ? ` ${pluralizeUnit(entitlement.unit)}` : "";
    limitNote = `${used.toLocaleString()} / ${entitlement.limit.toLocaleString()}${unit}`;
  }

  const selfServe = Boolean(prod.pro?.planKey);

  let action = null;
  if (!readOnly) {
    if (entitled) {
      action = (
        <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
          Manage
        </Button>
      );
    } else if (selfServe) {
      action = (
        <Button variant="org" size="sm" onClick={() => onManage(prod.id)}>
          <ArrowBigUpDashIcon />
          Upgrade
        </Button>
      );
    } else if (prod.enterprise) {
      action = (
        <Button variant="org" size="sm" onClick={() => onContact(prod)}>
          Contact sales
        </Button>
      );
    }
  }

  return (
    <div className="flex items-center gap-4 border-t border-border py-4 first:border-t-0">
      <ProductIcon product={prod} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{prod.name}</span>
          {prod.addon && <Badge variant="neutral">Add-on</Badge>}
          {entitled ? <ActiveBadge /> : <Badge variant="neutral">Inactive</Badge>}
        </div>
        <div className="text-xs text-muted">{prod.tagline || prod.desc}</div>
      </div>
      {limitNote && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-xs font-semibold text-foreground">{limitNote}</span>
          <span className="text-xs text-muted">in use</span>
        </div>
      )}
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
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

const ProductsCard = ({ overview, catalog, readOnly, onManage, onContact }: ProductsCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <Package className="size-4 text-accent" />
        Products
      </CardTitle>
      <CardDescription>Everything you can run on your subscription.</CardDescription>
    </CardHeader>
    <CardContent>
      {catalog.length === 0 ? (
        <CardEmpty
          title="No products available"
          description="Products will appear here once they're available."
        />
      ) : (
        <div className="flex flex-col">
          {catalog.map((prod) => (
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
        <UsageCard overview={overview} />
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
      <SummaryCard overview={overview} />
      <UsageCard overview={overview} />
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
