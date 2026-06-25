import { Award, Box, LucideIcon, ScanLine, Shield, Zap } from "lucide-react";

import { Badge, Label } from "@app/components/v3";
import { getProjectLucideIcon } from "@app/helpers/project";
import { BillingV2CatalogProduct } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

// Catalog products carry a free-form icon token (license-server presentation metadata), not a
// project type. Tokens that name one of our products resolve through the shared project icon helper
// so billing stays in sync with the rest of the app; add-on / generic tokens keep a direct glyph,
// and anything unrecognized falls back to Box.
const TOKEN_PROJECT_TYPE: Record<string, ProjectType> = {
  vault: ProjectType.SecretManager,
  key: ProjectType.SecretManager,
  file_key: ProjectType.CertificateManager,
  lock: ProjectType.KMS,
  scan_search: ProjectType.SecretScanning,
  radar: ProjectType.SecretScanning,
  users: ProjectType.PAM,
  terminal: ProjectType.SSH
};

const ADDON_ICON_BY_TOKEN: Record<string, LucideIcon> = {
  shield: Shield,
  award: Award,
  scan_line: ScanLine,
  zap: Zap
};

const iconForToken = (token: string): LucideIcon => {
  const projectType = TOKEN_PROJECT_TYPE[token];
  if (projectType) {
    return getProjectLucideIcon(projectType);
  }
  return ADDON_ICON_BY_TOKEN[token] ?? Box;
};

type MeterTone = "ok" | "near" | "full";

type ProductIconProps = {
  product: BillingV2CatalogProduct;
  size?: number;
};

// Tinted product icon tile. The tint is per-product brand metadata from the API, so it stays inline.
export const ProductIcon = ({ product, size = 36 }: ProductIconProps) => {
  const Glyph = iconForToken(product.icon);
  const { color } = product;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-sm border transition-colors duration-200"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(to bottom right, color-mix(in srgb, ${color} 20%, transparent), color-mix(in srgb, ${color} 5%, transparent))`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color
      }}
    >
      <Glyph size={Math.round(size * 0.5)} />
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
