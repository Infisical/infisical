import { Box } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import { Badge } from "@app/components/v3";
import { BillingV2CatalogProduct } from "@app/hooks/api";

type ProductIconProps = {
  product: BillingV2CatalogProduct;
  size?: number;
};

// Shown while a product's icon chunk loads and for any token lucide doesn't recognize. Sized to half
// the tile via CSS so it matches the resolved glyph at any tile size.
const ProductIconFallback = () => <Box className="h-1/2 w-1/2" />;

// Tinted product icon tile. Both the icon token and the tint are per-product presentation metadata
// from the license-server catalog (the source of truth), so we render the glyph straight from the
// token rather than mapping it to an app concept. Catalog tokens are snake_case while lucide icon
// names are kebab-case, so we only normalize the separator before handing the name to lucide's
// dynamic icon. Unknown or still-loading tokens fall back to a generic box glyph (the catalog's own
// default is "box").
export const ProductIcon = ({ product, size = 36 }: ProductIconProps) => {
  const { color } = product;
  const glyphSize = Math.round(size * 0.5);
  const iconName = product.icon.replace(/_/g, "-") as IconName;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md border transition-colors duration-200"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(to bottom right, color-mix(in srgb, ${color} 20%, transparent), color-mix(in srgb, ${color} 5%, transparent))`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color
      }}
    >
      <DynamicIcon name={iconName} size={glyphSize} fallback={ProductIconFallback} />
    </div>
  );
};

export const ActiveBadge = () => <Badge variant="success">Active</Badge>;
