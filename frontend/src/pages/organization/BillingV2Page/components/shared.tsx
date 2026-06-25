import { Box } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import { Badge, Label } from "@app/components/v3";
import { BillingV2CatalogProduct } from "@app/hooks/api";

type MeterTone = "ok" | "near" | "full";

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

// A null limit is unlimited (no bar, no alarm).
const meterTone = (used: number, limit: number | null): MeterTone => {
  if (!limit || limit <= 2) {
    return "ok";
  }
  const r = used / limit;
  if (r >= 1) {
    return "full";
  }
  if (r >= 0.85) {
    return "near";
  }
  return "ok";
};

const FILL_TONE: Record<MeterTone, string> = {
  ok: "bg-org",
  near: "bg-warning",
  full: "bg-danger"
};

const COUNT_TONE: Record<MeterTone, string> = {
  ok: "text-foreground",
  near: "text-warning",
  full: "text-danger"
};

type LimitMeterProps = {
  label: string;
  used: number;
  limit: number | null;
};

export const LimitMeter = ({ label, used, limit }: LimitMeterProps) => {
  const tone = meterTone(used, limit);
  let pct = 0;
  if (limit) {
    pct = Math.min(100, Math.round((used / limit) * 100));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2.5">
        <Label>{label}</Label>
        <span className={`text-sm tabular-nums ${COUNT_TONE[tone]}`}>
          {used.toLocaleString()}
          {limit === null ? (
            <span className="text-muted"> / Unlimited</span>
          ) : (
            <span className="text-muted"> / {limit.toLocaleString()}</span>
          )}
        </span>
      </div>
      {limit !== null && limit > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all ${FILL_TONE[tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};
