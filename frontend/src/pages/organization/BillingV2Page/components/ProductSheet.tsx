import { ArrowRight, Check, ExternalLink, ShoppingCart } from "lucide-react";

import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { BillingV2Cadence, BillingV2CatalogProduct, BillingV2Entitlement } from "@app/hooks/api";

import { cadenceWord, fmtMoney, unitPrice } from "../billing-v2-data";
import { ActiveBadge, ProductIcon } from "./shared";

type ProPriceParts = { amount: string; unit: string } | null;

const proPriceParts = (prod: BillingV2CatalogProduct, cadence: BillingV2Cadence): ProPriceParts => {
  if (prod.model === "flat" || prod.model === "limit") {
    const base = prod.pro?.base;
    if (!base) {
      return null;
    }
    return { amount: fmtMoney(unitPrice(base, cadence)), unit: `/ ${cadenceWord(cadence)}` };
  }

  const dimension = prod.pro?.dims?.[0];
  if (!dimension) {
    return null;
  }
  return {
    amount: fmtMoney(unitPrice(dimension, cadence), 2),
    unit: `/ ${dimension.noun} / ${cadenceWord(cadence)}`
  };
};

const renderCompareCell = (value: string | boolean) => {
  if (value === true) {
    return <Check className="mx-auto size-3.5 text-success" />;
  }
  if (value === false) {
    return <span className="text-muted">—</span>;
  }
  return value;
};

type EntitlementSummaryProps = {
  entitlement?: BillingV2Entitlement;
};

const EntitlementSummary = ({ entitlement }: EntitlementSummaryProps) => {
  const entitled = Boolean(entitlement?.entitled);
  let detail = "This product isn't part of your current plan.";
  if (entitled) {
    detail = "This product is active on your subscription.";
    if (entitlement && entitlement.limit !== null && entitlement.limit !== undefined) {
      const used = entitlement.used ?? 0;
      detail = `Active on your subscription. ${used.toLocaleString()} of ${entitlement.limit.toLocaleString()} in use.`;
    }
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">Your Plan</span>
        {entitled ? <ActiveBadge /> : <Badge variant="neutral">Inactive</Badge>}
      </div>
      <div className="text-xs text-accent">{detail}</div>
    </div>
  );
};

type PlansViewProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const PlansView = ({ prod, entitlement, cadence, onContact }: PlansViewProps) => {
  const hasEnterprise = !!prod.enterprise;
  const priceParts = proPriceParts(prod, cadence);
  const entitled = Boolean(entitlement?.entitled);
  const selfServe = Boolean(prod.pro?.planKey);

  return (
    <>
      <EntitlementSummary entitlement={entitlement} />

      <div className={`grid gap-3.5 ${hasEnterprise ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        <div
          className={`flex flex-col gap-3.5 rounded-xl border p-[18px] ${
            entitled ? "border-success/40 bg-success/5" : "border-org/40 bg-org/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold text-foreground">Pro</span>
            {entitled ? (
              <Badge variant="success">
                <Check className="text-success" />
                Current Plan
              </Badge>
            ) : (
              <Badge variant="neutral">Self-Checkout</Badge>
            )}
          </div>
          {priceParts && (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-foreground">{priceParts.amount}</span>
              <span className="text-xs text-muted">{priceParts.unit}</span>
            </div>
          )}
          {prod.pro?.proFeature && <div className="text-xs text-accent">{prod.pro.proFeature}</div>}
        </div>

        {hasEnterprise && prod.enterprise && (
          <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-[18px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-foreground">Enterprise</span>
              <Badge variant="neutral">Talk to Us</Badge>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-semibold text-foreground">Custom</span>
            </div>
            <div className="text-xs text-accent">{prod.enterprise.feature}</div>
            {selfServe && (
              <Button
                variant="org"
                size="sm"
                className="mt-auto self-start"
                onClick={() => onContact(prod)}
              >
                Contact sales
                <ArrowRight />
              </Button>
            )}
          </div>
        )}
      </div>

      {hasEnterprise && prod.compare && (
        <div>
          <div className="mb-3 text-xs font-semibold text-muted">Compare Plans</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead aria-label="Feature" />
                <TableHead className="text-center">Pro</TableHead>
                <TableHead className="text-center">Enterprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prod.compare.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-accent">{row.label}</TableCell>
                  <TableCell className="text-center">{renderCompareCell(row.pro)}</TableCell>
                  <TableCell className="text-center">{renderCompareCell(row.ent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!(hasEnterprise && prod.compare) && prod.includes && (
        <div>
          <div className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            What&apos;s included
          </div>
          <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {prod.includes.map((f) => (
              <div className="flex items-start gap-2 text-xs text-accent" key={f}>
                <Check className="mt-0.5 size-3 shrink-0 text-success" />
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

type ProductSheetProps = {
  prodId: string;
  prod?: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
  redirecting?: boolean;
  onClose: () => void;
  onManage: (prodId: string) => void;
  onRemove: (prodId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

export const ProductSheet = ({
  prodId,
  prod,
  entitlement,
  cadence,
  redirecting,
  onClose,
  onManage,
  onRemove,
  onContact
}: ProductSheetProps) => {
  if (!prod) {
    return null;
  }

  const entitled = Boolean(entitlement?.entitled);
  const selfServe = Boolean(prod.pro?.planKey);

  let primaryCta = null;
  if (entitled) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} isPending={redirecting}>
        Manage in Stripe
        <ExternalLink />
      </Button>
    );
  } else if (selfServe) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} isPending={redirecting}>
        <ShoppingCart />
        Continue to Checkout
      </Button>
    );
  } else if (prod.enterprise) {
    primaryCta = (
      <Button variant="org" onClick={() => onContact(prod)}>
        Contact sales
        <ArrowRight />
      </Button>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !redirecting) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className={`w-full p-0 sm:max-w-3xl ${redirecting ? "[&>button]:hidden" : ""}`}
        onEscapeKeyDown={(e) => {
          if (redirecting) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          if (redirecting) {
            e.preventDefault();
          }
        }}
      >
        <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
          <ProductIcon product={prod} size={40} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </SheetTitle>
            <SheetDescription className="mt-1">{prod.tagline || prod.desc}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <PlansView
            prod={prod}
            entitlement={entitlement}
            cadence={cadence}
            onContact={onContact}
          />
        </div>

        <SheetFooter className="flex-row justify-start border-t">
          {primaryCta}
          <Button variant="outline" onClick={onClose} isDisabled={redirecting}>
            Close
          </Button>
          {entitled && selfServe && (
            <Button
              variant="danger"
              className="ml-auto"
              onClick={() => onRemove(prodId)}
              isDisabled={redirecting}
            >
              Remove
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
