import { Fragment, ReactNode, useState } from "react";
import { Box, MinusIcon, PlusIcon } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2CatalogProduct, BillingV2EntitlementDim } from "@app/hooks/api";

import {
  dimAnnualCommitted,
  dimBarSegments,
  dimHasCeiling,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  pluralizeUnit
} from "../billing-v2-format";

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

// A bordered empty state used inside billing cards when a section has nothing to show.
export const CardEmpty = ({ title, description }: { title: string; description?: ReactNode }) => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
    </EmptyHeader>
  </Empty>
);

// Checkout-style cost summary for the sheets: borderless Items joined into one bordered frame.
export const CostSummary = ({ children }: { children: ReactNode }) => (
  <ItemGroup className="gap-0 divide-y divide-border rounded-lg border border-border bg-card">
    {children}
  </ItemGroup>
);

type CostSummaryRowProps = {
  label: string;
  note?: ReactNode;
  value: string;
  // Swaps the price for a skeleton while re-pricing so a stale or zero amount never shows.
  isCalculating?: boolean;
  // Price overrides: text-base headlines "charged today"; text-warning/90 marks on-demand amounts.
  valueClassName?: string;
};

export const CostSummaryRow = ({
  label,
  note,
  value,
  isCalculating,
  valueClassName
}: CostSummaryRowProps) => (
  <Item className="p-4">
    <ItemContent>
      <ItemTitle>{label}</ItemTitle>
      {note ? <ItemDescription className="text-xs text-muted">{note}</ItemDescription> : null}
    </ItemContent>
    {isCalculating ? (
      <Skeleton className="h-5 w-20 shrink-0" />
    ) : (
      <span
        className={cn("shrink-0 text-sm font-medium text-foreground tabular-nums", valueClassName)}
      >
        {value}
      </span>
    )}
  </Item>
);

// Committed usage (meter fill + legend dot) takes the product's catalog tint, the same source as
// ProductIcon, at the 85% strength the old static token used. On-demand keeps the warning token:
// it flags overage cost, not product identity.
const committedTint = (color: string) => `color-mix(in srgb, ${color} 85%, transparent)`;

// Rate legend for annually-committed dimensions. DimensionMeter renders it per dim by default; a
// caller can hideLegend the meters and render one combined legend for the block.
export const DimensionRateLegend = ({
  dims,
  color
}: {
  dims: BillingV2EntitlementDim[];
  color: string;
}) => {
  const entries = dims.filter(
    (dim) =>
      dimAnnualCommitted(dim) && (dim.committedRate !== undefined || dim.onDemandRate !== undefined)
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {entries.map((dim) => (
        <Fragment key={dim.key}>
          {dim.committedRate !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: committedTint(color) }} />
              Committed {`${fmtMoney(dim.committedRate)} / ${dim.noun} /yr`}
            </span>
          )}
          {dim.onDemandRate !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-warning/85" />
              On-demand {`${fmtMoney(dim.onDemandRate)} / ${dim.noun} /mo`}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
};

type DimensionMeterProps = {
  dim: BillingV2EntitlementDim;
  // The product's catalog color; the committed fill and legend dot derive from it (like ProductIcon).
  color: string;
  // Suppress the per-dimension rate legend (the caller renders a combined DimensionRateLegend).
  hideLegend?: boolean;
};

// One usage line for a product dimension: an annual committed dimension shows committed fill plus
// on-demand overflow with a rate legend; a capped dimension a single used/limit fill; an uncapped
// one just its cost line, no bar.
export const DimensionMeter = ({ dim, color, hideLegend }: DimensionMeterProps) => {
  const committed = dimAnnualCommitted(dim);
  const { committedPct, onDemandPct } = dimBarSegments(dim);
  const onDemandQty = dimOnDemandQuantity(dim);
  const monthlyRate = dimMonthlyRate(dim);
  const hasCeiling = dimHasCeiling(dim);

  let right: ReactNode;
  if (committed) {
    right = (
      <>
        <span className="font-medium text-foreground">{(dim.committed ?? 0).toLocaleString()}</span>{" "}
        committed
        {onDemandQty > 0 ? (
          <>
            {" · "}
            <span className="font-medium text-warning/90">
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
        <div className="flex h-[5px] w-full gap-0.5 overflow-hidden rounded-xs bg-border">
          {/* Segments keep the soft outer corner but sit square against each other at the joint. */}
          <div
            className={cn("h-full rounded-xs transition-all", onDemandPct > 0 && "rounded-r-none")}
            style={{ width: `${committedPct}%`, background: committedTint(color) }}
          />
          {onDemandPct > 0 && (
            <div
              className="h-full rounded-xs rounded-l-none bg-warning/85 transition-all"
              style={{ width: `${onDemandPct}%` }}
            />
          )}
        </div>
      )}
      {committed && !hideLegend && <DimensionRateLegend dims={[dim]} color={color} />}
    </div>
  );
};

type StepperProps = {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  isDisabled?: boolean;
};

// A [-] [value] [+] quantity control. Values can be typed too: digits commit live while focused,
// blur/Enter clamps to [min, max], an empty draft reverts, and typing past max snaps down.
export const Stepper = ({ value, min = 0, max = 9999, onChange, isDisabled }: StepperProps) => {
  // Raw digits while typing; null when idle (the field shows the committed value).
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commitDraft = () => {
    if (draft) {
      onChange(clamp(parseInt(draft, 10)));
    }
    setDraft(null);
  };

  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border">
      <Button
        variant="ghost"
        size="sm"
        className="rounded-none px-3"
        isDisabled={isDisabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label="Decrease"
      >
        <MinusIcon className="size-4" />
      </Button>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? value.toLocaleString()}
        onFocus={(e) => {
          setDraft(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          const capped = digits && parseInt(digits, 10) > max ? String(max) : digits;
          setDraft(capped);
          if (capped) {
            onChange(clamp(parseInt(capped, 10)));
          }
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        disabled={isDisabled}
        aria-label="Quantity"
        className="w-14 border-x border-border bg-transparent py-1.5 text-center text-sm font-medium text-foreground tabular-nums outline-none focus:bg-container disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        variant="ghost"
        size="sm"
        className="rounded-none px-3"
        isDisabled={isDisabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label="Increase"
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
};
