import { Icon, type IconName } from "@app/components/v4/ui/icon";
import type { BillingCatalogProduct } from "@app/hooks/api/billing/types";

import { useOrgId } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";

const PRODUCT_ICONS: Record<string, IconName> = {
  secrets_manager: "key",
  secrets_management: "key",
  legacy_secret_management: "key",
  cert_management: "cert",
  pam: "terminal",
  kms: "lock",
  secret_scanning: "search",
  agent_vault: "agent"
};

export const productIconName = (product: Pick<BillingCatalogProduct, "id">): IconName =>
  PRODUCT_ICONS[product.id] ?? "apps";

export const ProductIcon = ({
  product,
  size = 16
}: {
  product: Pick<BillingCatalogProduct, "id" | "name">;
  size?: number;
}) => <Icon name={productIconName(product)} size={size} />;

export const useBillingSubscription = () => {
  const orgId = useOrgId();
  const { data } = useV4Adapter("billing").useSubscription(orgId);
  return data;
};
