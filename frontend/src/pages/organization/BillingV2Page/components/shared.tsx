import { ReactNode } from "react";
import { Box, MinusIcon, PlusIcon } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import { Badge, Button } from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2EntitlementDim
} from "@app/hooks/api";

import {
  dimAnnualCommitted,
  dimBarSegments,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  pluralizeUnit
} from "../billing-v2-data";

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

// A YEARLY / MONTHLY cadence pill matching a product's billing cadence.
export const CadenceBadge = ({ cadence }: { cadence: BillingV2Entitlement["cadence"] }) => {
  if (cadence === "annual") {
    return <Badge variant="info">Yearly</Badge>;
  }
  return <Badge variant="neutral">Monthly</Badge>;
};

// One usage line for a product dimension. An annual committed dimension shows the committed portion
// (blue) plus any on-demand overflow (amber) with a rate legend; a capped monthly/metered dimension
// shows a single "{used} / {limit} · $rate/unit/mo" fill. A dimension with no ceiling (uncapped
// monthly/metered) has nothing to track, so we drop the bar and render the cost line on its own.
export const DimensionMeter = ({ dim }: { dim: BillingV2EntitlementDim }) => {
  const committed = dimAnnualCommitted(dim);
  const { committedPct, onDemandPct } = dimBarSegments(dim);
  const onDemandQty = dimOnDemandQuantity(dim);
  const monthlyRate = dimMonthlyRate(dim);
  // A bar only earns its place when there's a ceiling to fill against: an annual commitment or a
  // finite limit. A bar that can never fill is noise, so an uncapped dimension is a cost line only.
  const hasCeiling = committed || (dim.limit !== null && dim.limit > 0);

  let right: ReactNode;
  if (committed) {
    right = (
      <>
        <span className="font-medium text-foreground">{(dim.committed ?? 0).toLocaleString()}</span>{" "}
        committed
        {onDemandQty > 0 ? (
          <>
            {" · "}
            <span className="font-medium text-warning">
              {onDemandQty.toLocaleString()} on-demand
            </span>
          </>
        ) : (
          <> · {dim.used.toLocaleString()} used</>
        )}
      </>
    );
  } else {
    right = (
      <>
        <span className="font-medium text-foreground">{dim.used.toLocaleString()}</span>
        {dim.limit !== null ? ` / ${dim.limit.toLocaleString()}` : ` ${pluralizeUnit(dim.noun)}`}
        {monthlyRate > 0 && <span> · {`${fmtMoney(monthlyRate)}/${dim.noun}/mo`}</span>}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2.5 text-xs">
        <span className="text-muted">{dim.label}</span>
        <span className="text-muted tabular-nums">{right}</span>
      </div>
      {hasCeiling && (
        <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${committedPct}%` }}
          />
          {onDemandPct > 0 && (
            <div
              className="h-full rounded-full bg-warning transition-all"
              style={{ width: `${onDemandPct}%` }}
            />
          )}
        </div>
      )}
      {committed && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {dim.committedRate !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" />
              Committed {`${fmtMoney(dim.committedRate)} / ${dim.noun} /yr`}
            </span>
          )}
          {dim.onDemandRate !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-warning" />
              On-demand {`${fmtMoney(dim.onDemandRate)} / ${dim.noun} /mo`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

type StepperProps = {
  value: number;
  min?: number;
  onChange: (value: number) => void;
  isDisabled?: boolean;
};

// A small [-] [value] [+] quantity control for setting a commitment count.
export const Stepper = ({ value, min = 0, onChange, isDisabled }: StepperProps) => (
  <div className="flex items-center overflow-hidden rounded-md border border-border">
    <Button
      variant="ghost"
      size="sm"
      className="rounded-none px-3"
      isDisabled={isDisabled || value <= min}
      onClick={() => onChange(Math.max(min, value - 1))}
      aria-label="Decrease"
    >
      <MinusIcon className="size-4" />
    </Button>
    <span className="min-w-12 border-x border-border py-1.5 text-center text-sm font-medium text-foreground tabular-nums">
      {value.toLocaleString()}
    </span>
    <Button
      variant="ghost"
      size="sm"
      className="rounded-none px-3"
      isDisabled={isDisabled}
      onClick={() => onChange(value + 1)}
      aria-label="Increase"
    >
      <PlusIcon className="size-4" />
    </Button>
  </div>
);
