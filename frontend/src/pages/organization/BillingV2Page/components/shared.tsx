import { BillingV2CatalogProduct } from "@app/hooks/api";

import {
  IconBox,
  IconKey,
  IconLock,
  IconProps,
  IconScan,
  IconShieldCheck,
  IconZap
} from "../icons";

type IconComponent = (props: IconProps) => JSX.Element;

const ICON_BY_NAME: Record<string, IconComponent> = {
  IconKey,
  IconShieldCheck,
  IconLock,
  IconScan,
  IconZap,
  IconBox
};

type StatusType = "trialing" | "past-due" | "suspended" | "active";

type MeterTone = "ok" | "near" | "full";

type ProductIconProps = {
  product: BillingV2CatalogProduct;
  size?: number;
};

// Tinted product icon tile (follows the design-system tint pattern).
export const ProductIcon = ({ product, size = 38 }: ProductIconProps) => {
  const Glyph = ICON_BY_NAME[product.icon] || IconBox;
  const c = product.color;
  return (
    <div
      className="prod-ico"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${c} 30%, transparent)`,
        color: c
      }}
    >
      <Glyph size={Math.round(size * 0.5)} stroke={1.75} />
    </div>
  );
};

type StatusBadgeProps = {
  status: StatusType;
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  if (status === "trialing") {
    return <span className="badge badge-info">Trial</span>;
  }
  if (status === "past-due") {
    return <span className="badge badge-warning">Past due</span>;
  }
  if (status === "suspended") {
    return <span className="badge badge-danger">Suspended</span>;
  }
  return (
    <span className="badge badge-success" style={{ gap: 5 }}>
      <span className="dot" />
      Active
    </span>
  );
};

// Usage level to meter color. A null limit is unlimited (no bar, no alarm).
export const meterTone = (used: number, limit: number | null): MeterTone => {
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

type LimitMeterProps = {
  label: string;
  used: number;
  limit: number | null;
};

// A single real usage meter: label, used/limit bar. Null limit renders "Unlimited" with no bar.
export const LimitMeter = ({ label, used, limit }: LimitMeterProps) => {
  const tone = meterTone(used, limit);
  let pct = 0;
  if (limit) {
    pct = Math.min(100, Math.round((used / limit) * 100));
  }
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        <span className={`meter-count tone-${tone}`}>
          {used.toLocaleString()}
          {limit === null ? (
            <span className="meter-cap"> / Unlimited</span>
          ) : (
            <span className="meter-cap"> / {limit.toLocaleString()}</span>
          )}
        </span>
      </div>
      {limit !== null && limit > 0 && (
        <div className="meter-track">
          <div className={`meter-fill tone-${tone}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};
