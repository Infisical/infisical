import { faArrowRight, faCheck, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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

type ProPriceParts = { amt: string; unit: string } | null;

const proPriceParts = (prod: BillingV2CatalogProduct, cad: BillingV2Cadence): ProPriceParts => {
  if (prod.model === "flat" || prod.model === "limit") {
    const b = prod.pro?.base;
    if (!b) {
      return null;
    }
    return { amt: fmtMoney(unitPrice(b, cad)), unit: `/ ${cadenceWord(cad)}` };
  }

  const d = prod.pro?.dims?.[0];
  if (!d) {
    return null;
  }
  let suffix = "mo";
  if (cad === "annual") {
    suffix = "yr";
  }
  return { amt: fmtMoney(unitPrice(d, cad), 2), unit: `/ ${d.noun} / ${suffix}` };
};

const CmpCell = (v: string | boolean) => {
  if (v === true) {
    return <FontAwesomeIcon icon={faCheck} className="text-success" />;
  }
  if (v === false) {
    return <span className="text-mineshaft-500">—</span>;
  }
  return v;
};

type EntitlementSummaryProps = {
  entitlement?: BillingV2Entitlement;
};

const EntitlementSummary = ({ entitlement }: EntitlementSummaryProps) => {
  const entitled = Boolean(entitlement?.entitled);
  let detail = "This product is not part of your current plan.";
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
        <span className="text-xs font-medium text-mineshaft-300">Your plan</span>
        {entitled ? <ActiveBadge /> : <Badge variant="neutral">Not in your plan</Badge>}
      </div>
      <div className="text-xs text-mineshaft-300">{detail}</div>
    </div>
  );
};

type PlansViewProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
};

const PlansView = ({ prod, entitlement, cadence }: PlansViewProps) => {
  const hasEnt = !!prod.enterprise;
  const pp = proPriceParts(prod, cadence);
  const entitled = Boolean(entitlement?.entitled);

  return (
    <>
      <EntitlementSummary entitlement={entitlement} />

      <div className={`grid gap-3.5 ${hasEnt ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        <div
          className={`flex flex-col gap-3.5 rounded-xl border p-[18px] ${
            entitled ? "border-mineshaft-500 bg-mineshaft-700/40" : "border-org/40 bg-org/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold text-foreground">Pro</span>
            {entitled ? (
              <Badge variant="outline">
                <FontAwesomeIcon icon={faCheck} className="text-success" />
                Current plan
              </Badge>
            ) : (
              <Badge variant="org">Self-serve</Badge>
            )}
          </div>
          {pp ? (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-foreground">{pp.amt}</span>
              <span className="text-xs text-mineshaft-400">{pp.unit}</span>
            </div>
          ) : null}
          {prod.pro?.proFeature ? (
            <div className="text-xs text-mineshaft-300">{prod.pro.proFeature}</div>
          ) : null}
        </div>

        {hasEnt && prod.enterprise ? (
          <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-[18px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-foreground">Enterprise</span>
              <Badge variant="info">Sales-led</Badge>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-semibold text-foreground">Custom</span>
            </div>
            <div className="text-xs text-mineshaft-300">{prod.enterprise.feature}</div>
          </div>
        ) : null}
      </div>

      {hasEnt && prod.compare ? (
        <div>
          <div className="mb-3 text-xs font-semibold tracking-wide text-mineshaft-400 uppercase">
            Compare plans
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead aria-label="Feature" />
                <TableHead className="text-center text-org">Pro</TableHead>
                <TableHead className="text-center text-info">Enterprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prod.compare.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-mineshaft-200">{row.label}</TableCell>
                  <TableCell className="text-center">{CmpCell(row.pro)}</TableCell>
                  <TableCell className="text-center">{CmpCell(row.ent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {!(hasEnt && prod.compare) && prod.includes ? (
        <div>
          <div className="mb-3 text-xs font-semibold tracking-wide text-mineshaft-400 uppercase">
            What&apos;s included
          </div>
          <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {prod.includes.map((f) => (
              <div className="flex items-start gap-2 text-xs text-mineshaft-200" key={f}>
                <FontAwesomeIcon icon={faCheck} className="mt-0.5 shrink-0 text-success" />
                {f}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
};

type ProductSheetProps = {
  prodId: string;
  prod?: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
  manageMode: "checkout" | "portal";
  redirecting?: boolean;
  onClose: () => void;
  onManage: (prodId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

export const ProductSheet = ({
  prodId,
  prod,
  entitlement,
  cadence,
  manageMode,
  redirecting,
  onClose,
  onManage,
  onContact
}: ProductSheetProps) => {
  if (!prod) {
    return null;
  }

  const entitled = Boolean(entitlement?.entitled);
  const selfServe = Boolean(prod.pro?.planKey);

  let primaryCta = null;
  if (entitled || (selfServe && manageMode === "portal")) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} isPending={redirecting}>
        Manage in Stripe
        <FontAwesomeIcon icon={faUpRightFromSquare} />
      </Button>
    );
  } else if (selfServe) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} isPending={redirecting}>
        Continue to Checkout
      </Button>
    );
  } else if (prod.enterprise) {
    primaryCta = (
      <Button variant="info" onClick={() => onContact(prod)}>
        Contact sales
        <FontAwesomeIcon icon={faArrowRight} />
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
        <SheetHeader className="flex-row items-start gap-3.5 border-b pr-12">
          <ProductIcon product={prod} size={40} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
              {prod.name}
              {entitled ? <ActiveBadge /> : null}
              {prod.addon ? <Badge variant="neutral">Add-on</Badge> : null}
            </SheetTitle>
            <SheetDescription className="mt-1">{prod.tagline || prod.desc}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <PlansView prod={prod} entitlement={entitlement} cadence={cadence} />
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={onClose} isDisabled={redirecting}>
            Close
          </Button>
          {primaryCta}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
