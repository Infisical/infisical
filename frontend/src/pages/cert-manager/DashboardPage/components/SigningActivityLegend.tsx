import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useProject } from "@app/context";
import { getInstancePinningLink } from "@app/helpers/project";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { SigningActivityOrderBy } from "@app/hooks/api/signers";

import { formatShare } from "./chart-theme";

export enum SigningActivityView {
  Status = "status",
  Signer = "signer"
}

export type SigningActivitySeries = {
  key: string;
  label: string;
  color: string;
  failed: number;
  total: number;
  groupedCount?: number;
};

type Props = {
  view: SigningActivityView;
  series: SigningActivitySeries[];
  total: number;
  orderBy: SigningActivityOrderBy;
  orderDirection: OrderByDirection;
  onSortChange: (orderBy: SigningActivityOrderBy, orderDirection: OrderByDirection) => void;
  isolatedKey: string | null;
  onIsolatedKeyChange: (key: string | null) => void;
  onHoveredKeyChange: (key: string | null) => void;
};

const COUNT_COLUMN_CLASS = "w-14 shrink-0 text-right tabular-nums";
const SHARE_COLUMN_CLASS = "w-9 shrink-0 text-right tabular-nums";
const LINK_COLUMN_CLASS = "flex w-4 shrink-0 justify-end";

export const SigningActivityLegend = ({
  view,
  series,
  total,
  orderBy,
  orderDirection,
  onSortChange,
  isolatedKey,
  onIsolatedKeyChange,
  onHoveredKeyChange
}: Props) => {
  const { currentProject } = useProject();
  const isSignerView = view === SigningActivityView.Signer;

  const renderSortHeader = (key: SigningActivityOrderBy, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (orderBy !== key) {
          onSortChange(key, OrderByDirection.DESC);
          return;
        }
        onSortChange(
          key,
          orderDirection === OrderByDirection.DESC ? OrderByDirection.ASC : OrderByDirection.DESC
        );
      }}
      className={twMerge(
        "flex w-14 shrink-0 items-center justify-end gap-0.5",
        orderBy === key ? "text-foreground" : "hover:text-foreground"
      )}
    >
      {label}
      {orderBy === key &&
        (orderDirection === OrderByDirection.DESC ? (
          <ArrowDownIcon className="size-3" />
        ) : (
          <ArrowUpIcon className="size-3" />
        ))}
    </button>
  );

  const renderCells = (row: SigningActivitySeries) => {
    const label = row.groupedCount ? `${row.label} · ${row.groupedCount} more` : row.label;
    return (
      <>
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-left text-foreground">{label}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
        {isSignerView && (
          <span
            className={twMerge(
              COUNT_COLUMN_CLASS,
              row.failed > 0 ? "text-danger" : "text-foreground"
            )}
          >
            {row.failed}
          </span>
        )}
        <span className={twMerge(COUNT_COLUMN_CLASS, "font-medium text-foreground")}>
          {row.total}
        </span>
        <span className={twMerge(SHARE_COLUMN_CLASS, "text-muted")}>
          {formatShare(row.total, total)}
        </span>
      </>
    );
  };

  return (
    <div className="flex w-full shrink-0 flex-col text-xs lg:w-[320px]">
      <div className="flex items-center gap-2 border-b border-border px-1 pb-1.5 text-muted">
        <span className="flex-1">{isSignerView ? "Signer" : "Status"}</span>
        {isSignerView ? (
          <>
            {renderSortHeader(SigningActivityOrderBy.Failed, "Failed")}
            {renderSortHeader(SigningActivityOrderBy.Total, "Total")}
          </>
        ) : (
          <span className={COUNT_COLUMN_CLASS}>Count</span>
        )}
        <span className={SHARE_COLUMN_CLASS}>Share</span>
        <span className={LINK_COLUMN_CLASS} />
      </div>
      <div className="mt-1 space-y-0.5">
        {series.map((row) => {
          const isIsolated = isolatedKey === row.key;
          const isDimmed = Boolean(isolatedKey) && !isIsolated;

          if (row.groupedCount) {
            return (
              <div
                key={row.key}
                className={twMerge("flex items-center gap-2 px-1 py-1", isDimmed && "opacity-50")}
              >
                {renderCells(row)}
                <span className={LINK_COLUMN_CLASS} />
              </div>
            );
          }

          return (
            <div
              key={row.key}
              onMouseEnter={() => onHoveredKeyChange(row.key)}
              onMouseLeave={() => onHoveredKeyChange(null)}
              className={twMerge(
                "group flex items-center gap-2 rounded px-1 transition-colors hover:bg-foreground/5",
                isIsolated && "bg-foreground/5",
                isDimmed && "opacity-50"
              )}
            >
              <button
                type="button"
                aria-pressed={isIsolated}
                onClick={() => onIsolatedKeyChange(isIsolated ? null : row.key)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {renderCells(row)}
              </button>
              <span className={LINK_COLUMN_CLASS}>
                {isSignerView && (
                  <Link
                    {...getInstancePinningLink(
                      currentProject.orgId,
                      currentProject,
                      `code-signing/${row.key}`
                    )!}
                    aria-label={`Open ${row.label}`}
                    className="text-muted opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <ArrowUpRightIcon className="size-3.5" />
                  </Link>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-2">
        <span className="flex-1 font-medium text-foreground">Total</span>
        {isSignerView && <span className={COUNT_COLUMN_CLASS} />}
        <span className={twMerge(COUNT_COLUMN_CLASS, "font-semibold text-foreground")}>
          {total}
        </span>
        <span className={SHARE_COLUMN_CLASS} />
        <span className={LINK_COLUMN_CLASS} />
      </div>
    </div>
  );
};
