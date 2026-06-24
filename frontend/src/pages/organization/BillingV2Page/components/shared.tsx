import {
  faAward,
  faBolt,
  faBox,
  faKey,
  faLock,
  faMagnifyingGlass,
  faShieldHalved,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge } from "@app/components/v3";
import { BillingV2CatalogProduct } from "@app/hooks/api";

// Maps the catalog icon token (license-server presentation metadata) to a FontAwesome glyph.
// Tokens mirror the license server's icon vocabulary; unknown tokens fall back to faBox.
const ICON_BY_NAME: Record<string, IconDefinition> = {
  lock: faLock,
  shield: faShieldHalved,
  award: faAward,
  scan_line: faMagnifyingGlass,
  zap: faBolt,
  key: faKey,
  box: faBox
};

type MeterTone = "ok" | "near" | "full";

type ProductIconProps = {
  product: BillingV2CatalogProduct;
  size?: number;
};

// Tinted product icon tile. The tint is per-product brand metadata from the API, so it stays inline.
export const ProductIcon = ({ product, size = 38 }: ProductIconProps) => {
  const glyph = ICON_BY_NAME[product.icon] ?? faBox;
  const { color } = product;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color
      }}
    >
      <FontAwesomeIcon icon={glyph} style={{ fontSize: Math.round(size * 0.45) }} />
    </div>
  );
};

export const ActiveBadge = () => (
  <Badge variant="success">
    <span className="size-1.5 rounded-full bg-current" />
    Active
  </Badge>
);

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
        <span className="text-xs text-mineshaft-300">{label}</span>
        <span className={`text-xs tabular-nums ${COUNT_TONE[tone]}`}>
          {used.toLocaleString()}
          {limit === null ? (
            <span className="text-mineshaft-400"> / Unlimited</span>
          ) : (
            <span className="text-mineshaft-400"> / {limit.toLocaleString()}</span>
          )}
        </span>
      </div>
      {limit !== null && limit > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-mineshaft-600">
          <div
            className={`h-full rounded-full transition-all ${FILL_TONE[tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};
