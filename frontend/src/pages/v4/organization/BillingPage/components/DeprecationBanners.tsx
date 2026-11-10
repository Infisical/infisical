import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Dialog, DialogContent } from "@app/components/v4/ui/dialog";
import { Inline } from "@app/components/v4/ui/layout";
import type { BillingCatalogProduct, BillingOverview } from "@app/hooks/api/billing/types";

import { tierLabel } from "../billing-format";
import { daysLeftLabel, type DeprecatedEntry, type Deprecation } from "./deprecation-data";
import { DeprecationDetailBody } from "./DeprecationDetailBody";

// Attention banners, one per affected product. A retiring plan reads forward-looking in warn tone;
// a discontinued product reads terminal in bad tone, and a retiring plan escalates to bad inside the
// final two weeks. Products sort terminal-first, then most-urgent-first.
export const DeprecationBanners = ({
  overview,
  catalog,
  onManage,
  onContact
}: {
  overview: BillingOverview;
  catalog: BillingCatalogProduct[];
  onManage: (productId: string) => void;
  onContact: (prod: BillingCatalogProduct) => void;
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

  if (entries.length === 0 || !overview.selfServe) {
    return null;
  }

  return (
    <>
      {entries.map((entry) => {
        const { deprecation, name, planTier, productId } = entry;
        const isProduct = deprecation.kind === "product";
        const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
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
          <Alert
            key={productId}
            tone={isProduct || urgent ? "bad" : "warn"}
            title={title}
            actions={
              <>
                {isProduct ? (
                  catalogProduct && (
                    <Button variant="outline" size="xs" onClick={() => onContact(catalogProduct)}>
                      Contact support
                    </Button>
                  )
                ) : (
                  <Button variant="outline" size="xs" onClick={() => onManage(productId)}>
                    Review plan
                  </Button>
                )}
                {hasDetail && (
                  <Button variant="ghost" size="xs" onClick={() => setDetail(entry)}>
                    See what changes
                  </Button>
                )}
              </>
            }
          >
            <Inline gap={8}>
              <span className="line-clamp-2">{lead}</span>
              {label && <Badge tone={isProduct || urgent ? "bad" : "warn"}>{label}</Badge>}
            </Inline>
          </Alert>
        );
      })}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>{detail && <DeprecationDetailBody entry={detail} />}</DialogContent>
      </Dialog>
    </>
  );
};
