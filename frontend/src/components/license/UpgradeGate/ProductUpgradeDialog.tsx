import { ReactNode } from "react";
import { Check, Infinity as InfinityIcon, Plus } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Plan } from "@app/hooks/api";
import { ProductIcon } from "@app/pages/organization/BillingV2Page/components/shared";

import { UpgradeDialogLayout } from "./UpgradeDialogLayout";

export { focusUpgradeContinuation } from "./UpgradeDialogLayout";

export type PlanFeature = {
  label: string;
  value?: string;
  description?: string;
};

type Props = {
  product: BillingV2CatalogProduct;
  upgradeLabel?: string;
  requiredPlanName?: string;
  plans: BillingV2Plan[];
  selectedTier: string;
  currentPlanTier?: string;
  onTierChange: (tier: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  features: PlanFeature[];
  notice?: ReactNode;
  billingDetails?: ReactNode;
  footer: ReactNode;
};

const formatPlanFeatureTitle = ({ label, value }: PlanFeature) => {
  if (!value) return label;

  const dayValue = value.match(/^(\d+)\s+days?$/i);
  if (dayValue) {
    return `${dayValue[1]}-Day ${label}`;
  }

  return `${value} ${label}`;
};

const PlanFeatureIcon = ({ value }: { value?: string }) => {
  const className = "mt-0.5 size-4 shrink-0 text-success";
  if (value?.trim().toLowerCase() === "unlimited") {
    return <InfinityIcon aria-hidden="true" className={className} />;
  }
  if (value) return <Plus aria-hidden="true" className={className} />;
  return <Check aria-hidden="true" className={className} />;
};

export const ProductUpgradeDialog = ({
  product,
  upgradeLabel,
  requiredPlanName,
  plans,
  selectedTier,
  currentPlanTier,
  onTierChange,
  onOpenChange,
  features,
  notice,
  billingDetails,
  footer
}: Props) => (
  <UpgradeDialogLayout
    scopeName={product.name}
    icon={<ProductIcon product={product} size={64} />}
    title={upgradeLabel}
    description={
      requiredPlanName
        ? `Available with the ${requiredPlanName} plan and higher.`
        : "Review available plans for your team."
    }
    color={product.color}
    onOpenChange={onOpenChange}
    footer={footer}
  >
    <Tabs value={selectedTier} onValueChange={onTierChange} className="gap-6">
      <TabsList className="w-full" aria-label={`${product.name} plans`}>
        {plans.map((candidate) => (
          <TabsTrigger key={candidate.tier} value={candidate.tier}>
            {candidate.name}
            {candidate.tier === currentPlanTier && (
              <span className="text-xs text-muted">· Current</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={selectedTier} className="mt-0 outline-none focus-visible:ring-0">
        <section aria-label="Selected plan features" className="flex flex-col gap-6">
          {notice}
          {features.length > 0 && (
            <ul className="grid gap-4">
              {features.map((feature) => (
                <li key={feature.label} className="flex min-w-0 items-start gap-3">
                  <PlanFeatureIcon value={feature.value} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatPlanFeatureTitle(feature)}
                    </p>
                    {feature.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {feature.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {billingDetails}
        </section>
      </TabsContent>
    </Tabs>
  </UpgradeDialogLayout>
);
