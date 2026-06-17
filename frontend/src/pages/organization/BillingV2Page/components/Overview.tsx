import {
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2Invoice,
  BillingV2Overview
} from "@app/hooks/api";

import { fmtMoney, intervalWord } from "../billing-v2-data";
import {
  IconAlert,
  IconAlertCircle,
  IconArrowRight,
  IconCalendar,
  IconCreditCard,
  IconExternal,
  IconInfo,
  IconRefresh,
  IconShoppingBag
} from "../icons";
import { Button, Card, Skeleton } from "./primitives";
import { LimitMeter, ProductIcon, StatusBadge } from "./shared";

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

// Banners (managed info / dunning).
const Banner = ({
  mode,
  subState,
  canManage,
  onUpdatePayment,
  onManageSubscription
}: BannerProps) => {
  if (mode === "managed") {
    return (
      <div className="banner banner-info">
        <IconInfo className="b-ico" />
        <div className="b-body">
          <div className="b-title">Your plan is managed by your account team</div>
          <div className="b-text">
            Products and limits on this organization are set by contract. Contact your account
            manager to make changes.
          </div>
        </div>
      </div>
    );
  }
  if (subState === "past-due") {
    return (
      <div className="banner banner-warning">
        <IconAlert className="b-ico" />
        <div className="b-body">
          <div className="b-title">We couldn&apos;t process your last payment</div>
          <div className="b-text">
            Update your payment method to avoid losing access. Your products are still active while
            we retry.
          </div>
          {canManage && (
            <div className="b-actions">
              <Button variant="warning" size="sm" onClick={onUpdatePayment}>
                <IconCreditCard size={14} />
                Update payment method
              </Button>
              <Button variant="outline" size="sm" onClick={onManageSubscription}>
                Manage subscription
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (subState === "suspended") {
    return (
      <div className="banner banner-danger">
        <IconAlertCircle className="b-ico" />
        <div className="b-body">
          <div className="b-title">Your subscription is suspended</div>
          <div className="b-text">
            A payment kept failing and access is paused. Complete payment to restore access to your
            products.
          </div>
          {canManage && (
            <div className="b-actions">
              <Button variant="danger" size="sm" onClick={onUpdatePayment}>
                <IconCreditCard size={14} />
                Update payment method
              </Button>
              <Button variant="outline" size="sm" onClick={onManageSubscription}>
                Manage subscription
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Loading skeleton.
const OverviewSkeleton = () => (
  <div className="stack">
    <Card noPad>
      <div style={{ padding: 22, display: "flex", gap: 40 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton w="50%" h={10} />
            <Skeleton w="70%" h={22} />
          </div>
        ))}
      </div>
    </Card>
    <Card title={<Skeleton w={130} h={16} />}>
      {[0, 1].map((i) => (
        <div key={i} className="prod-item">
          <div className="prod-row">
            <Skeleton w={38} h={38} r={8} />
            <div className="prod-main" style={{ gap: 8 }}>
              <Skeleton w="40%" h={14} />
              <Skeleton w="25%" h={11} />
            </div>
            <Skeleton w={80} h={14} />
          </div>
        </div>
      ))}
    </Card>
  </div>
);

type ErrorPanelProps = {
  onRetry: () => void;
};

const ErrorPanel = ({ onRetry }: ErrorPanelProps) => (
  <Card>
    <div className="err-panel">
      <IconAlertCircle className="e-ico" size={30} />
      <div className="e-title">Couldn&apos;t load your subscription</div>
      <div className="e-text">
        There was a problem reaching the billing service. Your products are unaffected.
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <IconRefresh size={14} />
        Try again
      </Button>
    </div>
  </Card>
);

type GetStartedProps = {
  onGetStarted: () => void;
  canManage: boolean;
  loading?: boolean;
};

const GetStarted = ({ onGetStarted, canManage, loading }: GetStartedProps) => (
  <Card>
    <div className="getstarted">
      <div className="gs-ico">
        <IconShoppingBag size={26} />
      </div>
      <div className="gs-title">Start your subscription</div>
      <div className="gs-text">
        Pick the products your team needs and check out securely. You can change or cancel any time.
      </div>
      {canManage && (
        <Button variant="org" size="lg" onClick={onGetStarted} loading={loading}>
          Get started
          <IconArrowRight size={15} />
        </Button>
      )}
    </div>
  </Card>
);

type SummaryCardProps = {
  overview: BillingV2Overview;
};

type StatusBadgeStatus = "trialing" | "past-due" | "suspended" | "active";

const summaryStatus = (subState: BillingV2RenderState): StatusBadgeStatus => {
  if (subState === "trialing") {
    return "trialing";
  }
  if (subState === "past-due") {
    return "past-due";
  }
  if (subState === "suspended") {
    return "suspended";
  }
  return "active";
};

const recurringLabel = (overview: BillingV2Overview): string => {
  if (overview.subState === "no-subscription") {
    return "No subscription";
  }
  if (overview.recurringAmount === null || overview.recurringAmount === 0) {
    return "Free";
  }
  return `${fmtMoney(overview.recurringAmount)} / ${intervalWord(overview.interval)}`;
};

const SummaryCard = ({ overview }: SummaryCardProps) => (
  <Card noPad>
    <div className="summary">
      <div className="summary-top">
        <div className="summary-metric">
          <span className="lbl">Status</span>
          <span className="val" style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <StatusBadge status={summaryStatus(overview.subState)} />
          </span>
          <span className="sub">{overview.planName}</span>
        </div>
        <div className="summary-metric">
          <span className="lbl">Next billing date</span>
          <span className="val" style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <IconCalendar size={19} stroke={1.75} style={{ color: "#30b3ff" }} />
            {overview.nextBillingDate || "—"}
          </span>
          <span className="sub">All products renew together</span>
        </div>
        <div className="summary-metric">
          <span className="lbl">Recurring total</span>
          <div className="cost-block">
            <span className="cost-mtd">{recurringLabel(overview)}</span>
          </div>
        </div>
      </div>
    </div>
  </Card>
);

type UsageCardProps = {
  overview: BillingV2Overview;
};

const UsageCard = ({ overview }: UsageCardProps) => (
  <Card title="Usage">
    <div className="prod-usage" style={{ marginTop: 0 }}>
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
    </div>
  </Card>
);

type ProductRowProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const entitlementLabel = (entitlement?: BillingV2Entitlement): string => {
  if (entitlement?.entitled) {
    return "Active";
  }
  return "Not in your plan";
};

const ProductRow = ({ prod, entitlement, readOnly, onManage, onContact }: ProductRowProps) => {
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
        <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
          Manage
        </Button>
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
    <div className="prod-item">
      <div className="prod-row">
        <ProductIcon product={prod} />
        <div className="prod-main">
          <div className="prod-name-row">
            <span className="prod-name">{prod.name}</span>
            {prod.addon && <span className="prod-plan-chip">Add-on</span>}
            {entitled ? (
              <span className="badge badge-success" style={{ gap: 5 }}>
                <span className="dot" />
                {entitlementLabel(entitlement)}
              </span>
            ) : (
              <span className="badge badge-neutral">Not in your plan</span>
            )}
          </div>
          <div className="prod-meta">{prod.tagline || prod.desc}</div>
        </div>
        {limitNote && (
          <div className="prod-price">
            <span className="amt">{limitNote}</span>
            <div className="breakdown">in use</div>
          </div>
        )}
        {action && <div className="prod-actions">{action}</div>}
      </div>
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
  <Card title="Products" desc="Everything you can run on your subscription." noPad>
    {catalog.length === 0 ? (
      <div className="empty-row">No products are available yet.</div>
    ) : (
      <div className="prod-list" style={{ padding: "4px 20px 16px" }}>
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
  </Card>
);

type PaymentCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onUpdate: () => void;
};

const PaymentCard = ({ overview, canManage, onUpdate }: PaymentCardProps) => (
  <Card
    title="Payment method"
    action={
      canManage ? (
        <Button variant="outline" size="sm" onClick={onUpdate}>
          Update
        </Button>
      ) : undefined
    }
  >
    {overview.payment ? (
      <div className="info-row">
        <div className="info-pair">
          <div className="card-brand">{overview.payment.brand.toUpperCase()}</div>
          <div className="info-text">
            <div className="t1">
              {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
            </div>
            <div className="t2">
              Expires {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
              {String(overview.payment.expYear).slice(-2)}
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="empty-row">No payment method on file yet.</div>
    )}
  </Card>
);

type DetailsCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onEdit: () => void;
};

const DetailsCard = ({ overview, canManage, onEdit }: DetailsCardProps) => (
  <Card
    title="Billing details"
    action={
      canManage ? (
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
      ) : undefined
    }
  >
    {overview.billingDetails ? (
      <div className="detail-grid">
        <div className="detail-cell">
          <div className="dk">Billing name</div>
          <div className="dv">{overview.billingDetails.name || "—"}</div>
        </div>
        <div className="detail-cell">
          <div className="dk">Billing email</div>
          <div className="dv">{overview.billingDetails.email || "—"}</div>
        </div>
      </div>
    ) : (
      <div className="empty-row">No billing details on file yet.</div>
    )}
  </Card>
);

type InvoicesCardProps = {
  invoices: BillingV2Invoice[];
};

const InvoicesCard = ({ invoices }: InvoicesCardProps) => (
  <Card title="Invoices">
    {invoices.length === 0 ? (
      <div className="empty-row">
        No invoices yet. Your first invoice appears after your next billing date.
      </div>
    ) : (
      <table className="inv-tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th className="right">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.date}</td>
              <td className="mono">{fmtMoney(inv.amount)}</td>
              <td>
                {inv.paid ? (
                  <span className="badge badge-success">Paid</span>
                ) : (
                  <span className="badge badge-danger">Unpaid</span>
                )}
              </td>
              <td className="right">
                {inv.pdfUrl ? (
                  <a className="inv-dl" href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <IconExternal size={13} />
                    PDF
                  </a>
                ) : (
                  <span className="dv" style={{ color: "#707174" }}>
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
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
  onGetStarted: () => void;
  onRetry: () => void;
  canManageBilling: boolean;
  getStartedLoading?: boolean;
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
  onGetStarted,
  onRetry,
  canManageBilling,
  getStartedLoading
}: OverviewProps) => {
  if (subState === "loading") {
    return <OverviewSkeleton />;
  }

  if (subState === "error" || !overview) {
    return (
      <div className="stack">
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
      <div className="stack">
        <Banner
          mode={mode}
          subState={subState}
          canManage={canManageBilling}
          onUpdatePayment={onUpdatePayment}
          onManageSubscription={onManageSubscription}
        />
        <GetStarted
          onGetStarted={onGetStarted}
          canManage={canManageBilling}
          loading={getStartedLoading}
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
    <div className="stack">
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
