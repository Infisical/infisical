import { BillingV2Cadence, BillingV2CatalogProduct, BillingV2Entitlement } from "@app/hooks/api";

import { cadenceWord, fmtMoney, fmtMoney2, unitPrice } from "../billing-v2-data";
import { IconArrowRight, IconCheck, IconExternal, IconPlus, IconX } from "../icons";
import { Button } from "./primitives";
import { ProductIcon } from "./shared";

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
  return { amt: fmtMoney2(unitPrice(d, cad)), unit: `/ ${d.noun} / ${suffix}` };
};

export const CmpCell = (v: string | boolean) => {
  if (v === true) {
    return (
      <span className="cmp-check">
        <IconCheck size={15} stroke={2.5} />
      </span>
    );
  }
  if (v === false) {
    return <span className="cmp-dash">—</span>;
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
    <div className="sheet-usage">
      <div className="su-top">
        <span className="su-lbl">Your plan</span>
        {entitled ? (
          <span className="badge badge-success" style={{ gap: 5 }}>
            <span className="dot" />
            Active
          </span>
        ) : (
          <span className="badge badge-neutral">Not in your plan</span>
        )}
      </div>
      <div className="tier-desc" style={{ flex: "none" }}>
        {detail}
      </div>
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

      <div className={`tier-cards ${hasEnt ? "" : "single"}`}>
        <div className={`tier-card ${entitled ? "current" : "featured"}`}>
          <div className="tier-top">
            <span className="tier-name">Pro</span>
            {entitled ? (
              <span className="badge badge-outline" style={{ gap: 5 }}>
                <IconCheck size={11} stroke={2.5} style={{ color: "#2ecc71" }} />
                Current plan
              </span>
            ) : (
              <span className="badge badge-org">Self-serve</span>
            )}
          </div>
          {pp ? (
            <div className="tier-price">
              <span className="tp-amt">{pp.amt}</span>
              <span className="tp-unit">{pp.unit}</span>
            </div>
          ) : null}
          {prod.pro?.proFeature ? <div className="tier-desc">{prod.pro.proFeature}</div> : null}
        </div>

        {hasEnt && prod.enterprise ? (
          <div className="tier-card">
            <div className="tier-top">
              <span className="tier-name">Enterprise</span>
              <span className="badge badge-info">Sales-led</span>
            </div>
            <div className="tier-price">
              <span className="tp-amt">Custom</span>
            </div>
            <div className="tier-desc">{prod.enterprise.feature}</div>
          </div>
        ) : null}
      </div>

      {hasEnt && prod.compare ? (
        <div>
          <div className="cmp-h">Compare plans</div>
          <div className="cmp-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th aria-label="Feature" />
                  <th className="col">
                    <span className="ch-name org">Pro</span>
                  </th>
                  <th className="col ent">
                    <span className="ch-name ent">Enterprise</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {prod.compare.map((row) => (
                  <tr key={row.label}>
                    <td className="feat">{row.label}</td>
                    <td className="col">{CmpCell(row.pro)}</td>
                    <td className="col ent">{CmpCell(row.ent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!(hasEnt && prod.compare) && prod.includes ? (
        <div>
          <div className="cmp-h">What&apos;s included</div>
          <div className="incl-list">
            {prod.includes.map((f) => (
              <div className="incl-item" key={f}>
                <IconCheck className="ci-ico" size={14} stroke={2.25} />
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
  if (entitled) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} loading={redirecting}>
        Manage in Stripe
        <IconExternal size={14} />
      </Button>
    );
  } else if (selfServe) {
    primaryCta = (
      <Button variant="org" onClick={() => onManage(prodId)} loading={redirecting}>
        <IconPlus size={14} />
        Activate in Stripe
      </Button>
    );
  } else if (prod.enterprise) {
    primaryCta = (
      <Button variant="info" onClick={() => onContact(prod)}>
        Contact sales
        <IconArrowRight size={14} />
      </Button>
    );
  }

  // A product with both a self-serve tier and an Enterprise tier keeps a sales path alongside checkout.
  let secondaryCta = null;
  if (!entitled && selfServe && prod.enterprise) {
    secondaryCta = (
      <Button variant="info" onClick={() => onContact(prod)} disabled={redirecting}>
        Contact sales
        <IconArrowRight size={14} />
      </Button>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !redirecting) {
          onClose();
        }
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-head">
          <ProductIcon product={prod} size={40} />
          <div className="sh-titles">
            <div className="sheet-title">
              {prod.name}
              {entitled ? (
                <span className="badge badge-success" style={{ gap: 5 }}>
                  <span className="dot" />
                  Active
                </span>
              ) : null}
              {prod.addon ? <span className="badge badge-neutral">Add-on</span> : null}
            </div>
            <div className="sheet-sub">{prod.tagline || prod.desc}</div>
          </div>
          {!redirecting ? (
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
              style={{ marginTop: -2, marginRight: -6 }}
            >
              <IconX size={17} />
            </button>
          ) : null}
        </div>

        <div className="sheet-body">
          <PlansView prod={prod} entitlement={entitlement} cadence={cadence} />
        </div>

        <div className="sheet-foot">
          <Button variant="outline" onClick={onClose} disabled={redirecting}>
            Close
          </Button>
          {secondaryCta}
          {primaryCta}
        </div>
      </div>
    </div>
  );
};
