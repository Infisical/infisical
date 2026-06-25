import { ReactNode } from "react";
import {
  faCalendar,
  faCircleExclamation,
  faCircleInfo,
  faCreditCard,
  faRotate,
  faTriangleExclamation,
  faUpRightFromSquare,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2Invoice,
  BillingV2Overview
} from "@app/hooks/api";

import { fmtMoney, intervalWord } from "../billing-v2-data";
import { ActiveBadge, LimitMeter, ProductIcon } from "./shared";

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
  icon: IconDefinition;
  title: string;
  body: string;
};

const DUNNING: Partial<Record<BillingV2RenderState, Dunning>> = {
  "past-due": {
    variant: "warning",
    icon: faTriangleExclamation,
    title: "We couldn't process your last payment",
    body: "Update your payment method to avoid losing access. Your products are still active while we retry."
  },
  suspended: {
    variant: "danger",
    icon: faCircleExclamation,
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
        <FontAwesomeIcon icon={faCircleInfo} />
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

  return (
    <Alert variant={dunning.variant}>
      <FontAwesomeIcon icon={dunning.icon} />
      <AlertTitle>{dunning.title}</AlertTitle>
      <AlertDescription>
        {dunning.body}
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={dunning.variant} size="sm" onClick={onUpdatePayment}>
              <FontAwesomeIcon icon={faCreditCard} />
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

const CardEmpty = ({ children }: { children: ReactNode }) => (
  <div className="py-7 text-center text-sm text-mineshaft-400">{children}</div>
);

const OverviewSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Card className="p-0">
      <div className="flex gap-10 p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-2.5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ))}
      </div>
    </Card>
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
      <FontAwesomeIcon icon={faCircleExclamation} className="text-3xl text-danger" />
      <div className="text-base font-semibold text-foreground">
        Couldn&apos;t load your subscription
      </div>
      <div className="max-w-[40ch] text-sm text-mineshaft-300">
        There was a problem reaching the billing service. Your products are unaffected.
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <FontAwesomeIcon icon={faRotate} />
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

const SummaryCard = ({ overview }: SummaryCardProps) => (
  <Card className="overflow-hidden p-0">
    <div className="flex flex-wrap items-stretch">
      <div className="flex min-w-[180px] flex-1 flex-col gap-2 border-r border-border p-6">
        <span className="text-xs font-medium tracking-wide text-mineshaft-400 uppercase">
          Status
        </span>
        <span className="flex items-center text-2xl font-semibold text-foreground">
          <StatusBadge subState={overview.subState} />
        </span>
        <span className="text-xs text-mineshaft-400">{overview.planName}</span>
      </div>
      <div className="flex min-w-[180px] flex-1 flex-col gap-2 border-r border-border p-6">
        <span className="text-xs font-medium tracking-wide text-mineshaft-400 uppercase">
          Next billing date
        </span>
        <span className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <FontAwesomeIcon icon={faCalendar} className="text-lg text-org" />
          {overview.nextBillingDate || "—"}
        </span>
        <span className="text-xs text-mineshaft-400">All products renew together</span>
      </div>
      <div className="flex min-w-[180px] flex-1 flex-col gap-2 p-6">
        <span className="text-xs font-medium tracking-wide text-mineshaft-400 uppercase">
          Recurring total
        </span>
        <span className="text-2xl font-semibold text-foreground">{recurringLabel(overview)}</span>
      </div>
    </div>
  </Card>
);

type UsageCardProps = {
  overview: BillingV2Overview;
};

const UsageCard = ({ overview }: UsageCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Usage</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-2.5">
      <LimitMeter
        label="Members"
        used={overview.usage.members}
        limit={overview.usage.memberLimit}
      />
      <LimitMeter
        label="Machine identities"
        used={overview.usage.identities}
        limit={overview.usage.identityLimit}
      />
    </CardContent>
  </Card>
);

type ProductRowProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  onManage: (id: string) => void;
  onRemove: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ProductRow = ({
  prod,
  entitlement,
  readOnly,
  onManage,
  onRemove,
  onContact
}: ProductRowProps) => {
  const entitled = Boolean(entitlement?.entitled);
  let limitNote: string | null = null;
  if (entitled && entitlement && entitlement.limit !== null && entitlement.limit !== undefined) {
    const used = entitlement.used ?? 0;
    limitNote = `${used.toLocaleString()} / ${entitlement.limit.toLocaleString()}`;
  }

  const selfServe = Boolean(prod.pro?.planKey);

  let action = null;
  if (!readOnly) {
    if (entitled) {
      action = (
        <>
          {selfServe && (
            <Button variant="outline" size="sm" onClick={() => onRemove(prod.id)}>
              Remove
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
            Manage
          </Button>
        </>
      );
    } else if (selfServe) {
      action = (
        <Button variant="org" size="sm" onClick={() => onManage(prod.id)}>
          Upgrade
        </Button>
      );
    } else if (prod.enterprise) {
      action = (
        <Button variant="info" size="sm" onClick={() => onContact(prod)}>
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
        <div className="text-xs text-mineshaft-400">{prod.tagline || prod.desc}</div>
      </div>
      {limitNote && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm font-semibold text-foreground">{limitNote}</span>
          <span className="text-xs text-mineshaft-400">in use</span>
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
  onRemove: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ProductsCard = ({
  overview,
  catalog,
  readOnly,
  onManage,
  onRemove,
  onContact
}: ProductsCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Products</CardTitle>
      <CardDescription>Everything you can run on your subscription.</CardDescription>
    </CardHeader>
    <CardContent>
      {catalog.length === 0 ? (
        <CardEmpty>No products are available yet.</CardEmpty>
      ) : (
        <div className="flex flex-col">
          {catalog.map((prod) => (
            <ProductRow
              key={prod.id}
              prod={prod}
              entitlement={overview.entitlements[prod.id]}
              readOnly={readOnly}
              onManage={onManage}
              onRemove={onRemove}
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
      <CardTitle>Payment method</CardTitle>
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
          <div className="flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-sm border border-border bg-mineshaft-700 text-[10px] font-bold tracking-wide text-foreground">
            {overview.payment.brand.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
            </div>
            <div className="mt-0.5 text-xs text-mineshaft-400">
              Expires {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
              {String(overview.payment.expYear).slice(-2)}
            </div>
          </div>
        </div>
      ) : (
        <CardEmpty>No payment method on file yet.</CardEmpty>
      )}
    </CardContent>
  </Card>
);

type DetailsCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onEdit: () => void;
};

const DetailsCard = ({ overview, canManage, onEdit }: DetailsCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Billing details</CardTitle>
      {canManage && (
        <CardAction>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </CardAction>
      )}
    </CardHeader>
    <CardContent>
      {overview.billingDetails ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="mb-1 text-xs tracking-wide text-mineshaft-400 uppercase">
              Billing name
            </div>
            <div className="text-sm text-foreground">{overview.billingDetails.name || "—"}</div>
          </div>
          <div>
            <div className="mb-1 text-xs tracking-wide text-mineshaft-400 uppercase">
              Billing email
            </div>
            <div className="text-sm text-foreground">{overview.billingDetails.email || "—"}</div>
          </div>
        </div>
      ) : (
        <CardEmpty>No billing details on file yet.</CardEmpty>
      )}
    </CardContent>
  </Card>
);

type InvoicesCardProps = {
  invoices: BillingV2Invoice[];
};

const InvoicesCard = ({ invoices }: InvoicesCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Invoices</CardTitle>
    </CardHeader>
    <CardContent>
      {invoices.length === 0 ? (
        <CardEmpty>
          No invoices yet. Your first invoice appears after your next billing date.
        </CardEmpty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.date}</TableCell>
                <TableCell className="text-mineshaft-300 tabular-nums">
                  {fmtMoney(inv.amount, 2)}
                </TableCell>
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
                      className="inline-flex items-center gap-1.5 text-xs text-org hover:underline"
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FontAwesomeIcon icon={faUpRightFromSquare} />
                      PDF
                    </a>
                  ) : (
                    <span className="text-mineshaft-400">—</span>
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
  onRemove: (productId: string) => void;
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
  onRemove,
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
          onRemove={onRemove}
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
        onRemove={onRemove}
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
