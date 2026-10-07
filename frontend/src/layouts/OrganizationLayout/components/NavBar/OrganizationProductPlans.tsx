import { Link } from "@tanstack/react-router";
import { ChevronDown, CreditCard } from "lucide-react";

import { getProductPlanSummaries } from "@app/components/license/product-plan-summary";
import { ProductPlanSummaryList } from "@app/components/license/ProductPlanSummaryList";
import { Button, Popover, PopoverContent, PopoverTrigger, Separator } from "@app/components/v3";
import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

type Props = {
  plans: SubscriptionPlan["productPlans"];
  billingOrgId?: string;
  isSubOrganization: boolean;
};

export const OrganizationProductPlans = ({ plans, billingOrgId, isSubOrganization }: Props) => {
  const summaries = getProductPlanSummaries(plans);
  if (!summaries.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" aria-label="View Product Plans" className="shrink-0">
          <CreditCard />
          <span className="max-sm:hidden">Product Plans</span>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" collisionPadding={16}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">Product Plans</p>
            <p className="mt-1 text-xs text-muted">
              {isSubOrganization
                ? "Shared with your root organization."
                : "Your organization's current product subscriptions."}
            </p>
          </div>
          <ProductPlanSummaryList plans={summaries} />
          {billingOrgId && (
            <>
              <Separator />
              <Button variant="outline" size="xs" className="self-end" asChild>
                <Link to="/organizations/$orgId/billing" params={{ orgId: billingOrgId }}>
                  View Billing
                </Link>
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
