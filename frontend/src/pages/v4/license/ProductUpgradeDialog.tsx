import type { ReactNode } from "react";
import { Infinity as InfinityIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Icon } from "@app/components/v4/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";
import type { BillingCatalogPlan, BillingCatalogProduct } from "@app/hooks/api/billing/types";

import { ProductIcon } from "./product-icon";
import { UpgradeDialogLayout } from "./UpgradeDialogLayout";

import styles from "./upgrade-dialog.module.css";

export type PlanFeature = {
  label: string;
  value?: string;
  description?: string;
};

type Props = {
  product: BillingCatalogProduct;
  upgradeLabel: string;
  requiredPlanName?: string;
  plans: BillingCatalogPlan[];
  selectedTier: string;
  currentPlanTier?: string;
  onTierChange: (tier: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  features: PlanFeature[];
  notice?: ReactNode;
  footer: ReactNode;
};

export const formatPlanFeatureTitle = ({ label, value }: PlanFeature) => {
  if (!value) return label;

  const dayValue = value.match(/^(\d+)\s+days?$/i);
  if (dayValue) {
    return `${dayValue[1]}-day ${label}`;
  }

  return `${value} ${label}`;
};

export const PlanFeatureIcon = ({ value }: { value?: string }) => {
  if (value?.trim().toLowerCase() === "unlimited") return <Icon icon={InfinityIcon} />;
  if (value) return <Icon name="plus" />;
  return <Icon name="check" />;
};

export const PlanFeatureList = ({ features }: { features: PlanFeature[] }) => (
  <ul className={styles.features}>
    {features.map((feature) => (
      <li key={feature.label} className={styles.feature}>
        <PlanFeatureIcon value={feature.value} />
        <div className="min-w-0">
          <div className={styles.featureTitle}>{formatPlanFeatureTitle(feature)}</div>
          {feature.description && (
            <div className={styles.featureDescription}>{feature.description}</div>
          )}
        </div>
      </li>
    ))}
  </ul>
);

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
  footer
}: Props) => (
  <UpgradeDialogLayout
    scopeName={product.name}
    icon={<ProductIcon product={product} size={32} />}
    title={upgradeLabel}
    description={
      requiredPlanName ? `Available with the ${requiredPlanName} plan and higher.` : undefined
    }
    onOpenChange={onOpenChange}
    footer={footer}
  >
    <Tabs
      value={selectedTier}
      onValueChange={onTierChange}
      variant="segmented"
      className="items-start"
    >
      <TabsList variant="segmented" aria-label={`${product.name} plans`}>
        {plans.map((candidate) => (
          <TabsTrigger key={candidate.tier} value={candidate.tier}>
            {candidate.name}
            {candidate.tier === currentPlanTier && (
              <Badge tone="outline" size="sm">
                Current
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={selectedTier} className="self-stretch">
        <section aria-label="Selected plan features" className="flex flex-col gap-4">
          {notice}
          {features.length > 0 && <PlanFeatureList features={features} />}
        </section>
      </TabsContent>
    </Tabs>
  </UpgradeDialogLayout>
);
