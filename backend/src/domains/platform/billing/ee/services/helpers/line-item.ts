import { Meter, TUsageMeteringService } from "@app/domains/platform/license/ce/module";

import { TCadence } from "../../models/catalog-plan";
import { CatalogProduct } from "../../models/catalog-product";
import { ProductLineItem } from "../../models/product-line-item";

// The line a self-serve purchase or trial sends, seeded with what the org has provisioned now so the preview and
// the charge match it. Null when the product has no self-serve plan priced at the cadence.
export const resolveLineItem = async (
  usageMeteringService: TUsageMeteringService,
  {
    product,
    cadence,
    orgId,
    planTier,
    committed
  }: {
    product: CatalogProduct;
    cadence: TCadence;
    orgId: string;
    planTier?: string;
    committed?: Record<string, number>;
  }
): Promise<ProductLineItem | null> => {
  const plan = product.selfServePlan(planTier);
  if (!plan || !plan.sellsAt(cadence)) return null;

  const counted = await Promise.all(
    plan.perUnitPrices(cadence).map(async (price) => {
      const meter = Meter.fromKey(price.dimensionKey);
      const present = meter ? await usageMeteringService.countUsage(orgId, meter) : null;
      return { dimensionKey: price.dimensionKey, present, included: price.includedQuantity ?? 0 };
    })
  );
  return ProductLineItem.fromUsage({ planTier: plan.tier, cadence, counted, committed });
};
