import { TCatalogProduct } from "@app/domains/platform/license/ce/module";

import { CatalogPlan, TCatalogPlanView } from "./catalog-plan";
import { Deprecation, TDeprecationRecord } from "./deprecation";

export type TCompareRowView = { label: string; cells: Record<string, string | boolean | number> };

export type TCatalogProductView = {
  id: string;
  name: string;
  icon: string;
  color: string;
  addon?: boolean;
  tagline?: string;
  deprecated?: boolean;
  deprecation?: TDeprecationRecord;
  displayOrder?: number;
  plans: TCatalogPlanView[];
  includes?: string[];
  compare?: TCompareRowView[];
};

// For when the catalog omits a product's presentation; the client resolves the icon to a generic glyph.
const FALLBACK_ICON = "box";
const FALLBACK_COLOR = "#6b7280";

// A product the License Server sells, with its plans. Kept as the License Server's record, read through methods.
export class CatalogProduct {
  private readonly plans: CatalogPlan[];

  private constructor(private readonly record: TCatalogProduct) {
    this.plans = record.plans.map((plan) => CatalogPlan.restore(plan, record.dimensions));
  }

  static restore(record: TCatalogProduct): CatalogProduct {
    return new CatalogProduct(record);
  }

  static findIn(catalog: { products: TCatalogProduct[] } | null, productId: string): CatalogProduct | null {
    const record = catalog?.products.find((candidate) => candidate.id === productId);
    return record ? CatalogProduct.restore(record) : null;
  }

  // The plan a self-serve purchase is for: the named tier when it is self-serve, else the paid self-serve plan
  // (pro). Null when there is none, so the product can't be bought self-serve.
  selfServePlan(tier?: string): CatalogPlan | null {
    const plan = tier
      ? this.plans.find((candidate) => candidate.tier === tier && candidate.isSelfServe())
      : this.plans.find((candidate) => candidate.isPaidSelfServe());
    return plan ?? null;
  }

  // Every paid self-serve and sales-led plan, in catalog order, and comparison cells keyed by tier so the page can
  // render a column per plan.
  toView(now: Date): TCatalogProductView {
    const plans = this.plans.filter((plan) => plan.isOffered()).map((plan) => plan.toView(now));
    const compare: TCompareRowView[] = this.record.comparison.map((row) => {
      const cells: Record<string, string | boolean | number> = {};
      row.cells.forEach((cell) => {
        cells[cell.tier] = cell.value;
      });
      return { label: row.label, cells };
    });
    const deprecation = Deprecation.from(this.record, now);
    return {
      id: this.record.id,
      name: this.record.name,
      icon: this.record.icon || FALLBACK_ICON,
      color: this.record.color || FALLBACK_COLOR,
      addon: this.record.addon,
      tagline: this.record.tagline,
      deprecated: this.record.deprecated ?? false,
      ...(deprecation ? { deprecation } : {}),
      displayOrder: this.record.displayOrder ?? undefined,
      plans,
      includes: this.record.includes,
      compare
    };
  }
}
