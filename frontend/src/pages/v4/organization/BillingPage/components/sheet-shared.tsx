import { type ReactNode, useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v4/ui/input-group";
import { Media } from "@app/components/v4/ui/item";
import { Inline } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Progress } from "@app/components/v4/ui/progress";
import { SheetDescription, SheetHeader, SheetTitle } from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { SmallText } from "@app/components/v4/ui/text";
import type { BillingCatalogProduct, BillingEntitlementDim } from "@app/hooks/api/billing/types";

import { useV4Adapter } from "../../../data/adapters";
import {
  dimBarSegments,
  dimCommitted,
  dimHasCeiling,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  fmtMoneyCents,
  meteredRateInCaption
} from "../billing-format";
import { productIconName } from "./shared";

export const MANAGED_BILLING_REASON =
  "Contact your Infisical account manager to change your subscription.";

// SheetContent pins its header and footer only when the slots are its direct children, so a view
// component that renders them would fall back to one scrolling column. This rebuilds the DOM
// SheetContent builds for direct slots, so a view rendered inside the caller's SheetContent keeps
// the pinned header, the single scroll region and both rules.
export const SheetSections = ({
  header,
  body,
  footer
}: {
  header: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
}) => (
  <div data-sections="" className="flex min-h-0 flex-1 flex-col">
    <div data-slot="sheet-head">{header}</div>
    <div
      data-slot="sheet-scroll"
      data-scroll-fade="y"
      data-before-footer={footer ? true : undefined}
    >
      {body}
    </div>
    {footer}
  </div>
);

export const ProductSheetHeader = ({
  prod,
  title,
  description
}: {
  prod: Pick<BillingCatalogProduct, "id">;
  title: ReactNode;
  description?: ReactNode;
}) => (
  <SheetHeader>
    <Inline gap={12} wrap={false}>
      <Media icon={productIconName(prod)} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <SheetTitle>{title}</SheetTitle>
        {description && <SheetDescription>{description}</SheetDescription>}
      </div>
    </Inline>
  </SheetHeader>
);

export type CostSummaryRowProps = {
  label: string;
  note?: ReactNode;
  value: string;
  isCalculating?: boolean;
  tone?: "warn" | "muted";
};

const COST_VALUE_TONE = {
  warn: "text-[color:var(--v4-warn)]",
  muted: "text-muted-foreground"
} as const;

export const CostSummary = ({ rows }: { rows: CostSummaryRowProps[] }) => (
  <List variant="plain" label="Cost summary">
    {rows.map((row) => (
      <ListRow
        key={row.label}
        value={row.label}
        label={row.label}
        title={row.label}
        description={row.note}
        meta={
          row.isCalculating ? (
            <Skeleton width={80} height={16} />
          ) : (
            <span
              className={`font-medium tabular-nums ${row.tone ? COST_VALUE_TONE[row.tone] : "text-foreground"}`}
            >
              {row.value}
            </span>
          )
        }
      />
    ))}
  </List>
);

export const DimensionRateLegend = ({ dims }: { dims: BillingEntitlementDim[] }) => {
  const entries = dims
    .filter(dimCommitted)
    .flatMap((dim) => [
      dim.committedRate !== undefined
        ? `Committed ${fmtMoneyCents(dim.committedRate)} / ${dim.noun} / yr`
        : null,
      dim.onDemandRate !== undefined
        ? `On-demand ${fmtMoneyCents(dim.onDemandRate)} / ${dim.noun} / mo`
        : null
    ])
    .filter((entry): entry is string => Boolean(entry));
  if (entries.length === 0) {
    return null;
  }
  return (
    <Inline gap={12}>
      {entries.map((entry) => (
        <SmallText key={entry} muted>
          {entry}
        </SmallText>
      ))}
    </Inline>
  );
};

// One usage line for a product dimension: a committed dimension fills against its commitment and
// turns warn once usage runs past it into on-demand; a capped dimension fills against its limit; an
// uncapped one shows only its figures.
export const DimensionMeter = ({
  dim,
  hideLegend
}: {
  dim: BillingEntitlementDim;
  hideLegend?: boolean;
}) => {
  const committed = dimCommitted(dim);
  const { committedPct, onDemandPct } = dimBarSegments(dim);
  const onDemandQty = dimOnDemandQuantity(dim);
  const monthlyRate = dimMonthlyRate(dim);

  let valueLabel: string;
  if (committed) {
    const usage =
      onDemandQty > 0
        ? `${onDemandQty.toLocaleString()} on-demand`
        : `${dim.used.toLocaleString()} used`;
    valueLabel = `${(dim.committed ?? 0).toLocaleString()} committed, ${usage}`;
  } else {
    const limit = dim.limit === null ? "Unlimited" : dim.limit.toLocaleString();
    const rate =
      !meteredRateInCaption(dim) && monthlyRate > 0
        ? ` at ${fmtMoney(monthlyRate)}/${dim.noun}/mo`
        : "";
    valueLabel = `${dim.used.toLocaleString()} / ${limit}${rate}`;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {dimHasCeiling(dim) ? (
        <Progress
          label={dim.label}
          valueLabel={valueLabel}
          value={committedPct + onDemandPct}
          tone={onDemandPct > 0 ? "warn" : "ink"}
        />
      ) : (
        <div className="flex items-baseline justify-between gap-2.5">
          <SmallText>{dim.label}</SmallText>
          <SmallText muted>
            <span className="tabular-nums">{valueLabel}</span>
          </SmallText>
        </div>
      )}
      {committed && !hideLegend && <DimensionRateLegend dims={[dim]} />}
    </div>
  );
};

// A [-] [value] [+] quantity control. Values can be typed too: digits commit live while focused,
// blur or Enter clamps to [min, max], an empty draft reverts, and typing past max snaps down.
export const Stepper = ({
  value,
  min = 0,
  max = 9999,
  onChange,
  isDisabled,
  label
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  isDisabled?: boolean;
  label: string;
}) => {
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commitDraft = () => {
    if (draft) {
      onChange(clamp(parseInt(draft, 10)));
    }
    setDraft(null);
  };

  return (
    <div className="w-32 shrink-0">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupButton
            size="icon-xs"
            icon="minus"
            iconOnly
            aria-label={`Decrease ${label}`}
            disabled={isDisabled || value <= min}
            onClick={() => onChange(clamp(value - 1))}
          />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          inputMode="numeric"
          aria-label={label}
          value={draft ?? value.toLocaleString()}
          disabled={isDisabled}
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
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            icon="plus"
            iconOnly
            aria-label={`Increase ${label}`}
            disabled={isDisabled || value >= max}
            onClick={() => onChange(clamp(value + 1))}
          />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
};

// The bank declined or held a charge (payment_action_required). Nothing was applied, so the way
// forward is a different card from the billing portal and a retry.
export const PaymentActionRequiredNotice = ({ orgId }: { orgId: string }) => {
  const portalSession = useV4Adapter("billing").useCreatePortalSession();
  return (
    <Alert
      tone="warn"
      title="Your bank didn't approve this charge"
      actions={
        <Button
          variant="outline"
          size="xs"
          loading={portalSession.isPending}
          onClick={() =>
            portalSession.mutate(
              { orgId, returnPath: window.location.pathname },
              {
                onSuccess: (url) => {
                  window.location.href = url;
                }
              }
            )
          }
        >
          Open billing portal
        </Button>
      }
    >
      Nothing was changed. Try a different card from the billing portal, then retry.
    </Alert>
  );
};

export const PaymentApprovalNotice = ({ paymentUrl }: { paymentUrl: string }) => (
  <Alert
    tone="warn"
    title="Approve this payment with your bank"
    actions={
      <Button
        variant="outline"
        size="xs"
        icon="external"
        onClick={() => window.open(paymentUrl, "_blank", "noopener,noreferrer")}
      >
        Approve payment
      </Button>
    }
  >
    Your bank needs you to confirm this charge. Approve it to finish the change.
  </Alert>
);
