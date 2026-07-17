import { useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent
} from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Overview } from "@app/hooks/api";

import { tierLabel } from "../../billing-v2-format";
import { daysLeftLabel, DeprecatedEntry, Deprecation } from "./deprecation-data";
import { DeprecationDetailBody } from "./DeprecationDetailBody";

// Attention banners above the summary, one per affected product. A retiring plan reads forward-looking
// in warning tone; a discontinued product reads terminal in danger tone, escalating warning→danger
// inside the final window. Concise here with a "See what changes" detail dialog for the full copy.
// Products sort terminal-first, then most-urgent-first.
export const DeprecationBanners = ({
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
        <DialogContent className="max-w-md">
          {detail && <DeprecationDetailBody entry={detail} />}
        </DialogContent>
      </Dialog>
    </>
  );
};
