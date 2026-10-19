import * as React from "react";
import { MoreHorizontalIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";

import { cn } from "../lib/utils";
import { Icon } from "./icon";
import { Select } from "./select";
import { Spinner } from "./spinner";

import styles from "./pagination.module.css";

export interface PaginationProps extends React.ComponentPropsWithoutRef<"nav"> {
  variant?: "numbered" | "compact" | "more";
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  pageCount?: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
  onLoadMore?: () => void;
  label?: string;
}
export function paginationPages(page: number, pageCount: number): readonly (number | "gap")[] {
  const candidates = [
    ...new Set(
      [1, page - 1, page, page + 1, pageCount].filter((value) => value >= 1 && value <= pageCount)
    )
  ].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  candidates.forEach((value, index) => {
    const previous = candidates[index - 1];
    if (previous !== undefined && value - previous > 1) result.push("gap");
    result.push(value);
  });
  return result;
}
const Pagination = React.forwardRef<React.ComponentRef<"nav">, PaginationProps>(
  (
    {
      className,
      children,
      variant = "numbered",
      page,
      defaultPage = 1,
      onPageChange,
      pageCount,
      total,
      pageSize = 25,
      pageSizeOptions,
      onPageSizeChange,
      loading,
      onLoadMore,
      label = "Pagination",
      ...props
    },
    ref
  ) => {
    const [ownPage, setOwnPage] = React.useState(defaultPage);
    const sizeId = React.useId();
    const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 25;
    const count =
      total === undefined || !Number.isFinite(total) ? undefined : Math.max(0, Math.floor(total));
    const pages = Math.max(
      1,
      count !== undefined
        ? Math.ceil(count / size)
        : pageCount !== undefined && Number.isFinite(pageCount)
          ? Math.floor(pageCount)
          : 1
    );
    const inputPage = page ?? ownPage;
    const current = Math.max(
      1,
      Math.min(pages, Number.isFinite(inputPage) ? Math.floor(inputPage) : 1)
    );
    const change = (next: number) => {
      const safe = Math.max(1, Math.min(pages, next));
      if (safe === current || loading) return;
      if (page === undefined) setOwnPage(safe);
      onPageChange?.(safe);
    };
    const empty = count === 0;
    const remaining = count === undefined ? size : Math.max(0, count - current * size);
    let range: string | undefined =
      variant === "compact" ? undefined : `Page ${current} of ${pages}`;
    if (count !== undefined)
      range = empty
        ? "No results"
        : variant === "more"
          ? `Showing ${Math.min(count, current * size)} of ${count}`
          : `${(current - 1) * size + 1}–${Math.min(count, current * size)} of ${count}`;
    const step = (direction: "previous" | "next") => (
      <PaginationItem>
        <Button
          type="button"
          variant="ghost"
          icon={direction === "previous" ? "chev-left" : undefined}
          iconRight={direction === "next" ? "chev-right" : undefined}
          disabled={loading || (direction === "previous" ? current <= 1 : current >= pages)}
          aria-label={direction === "previous" ? "Go to previous page" : "Go to next page"}
          className={styles.step}
          onClick={() => change(direction === "previous" ? current - 1 : current + 1)}
        >
          <span className={styles.stepLabel}>{direction === "previous" ? "Previous" : "Next"}</span>
        </Button>
      </PaginationItem>
    );
    const controls =
      variant === "more" ? (
        current < pages && (
          <Button
            type="button"
            variant="outline"
            loading={Boolean(loading)}
            onClick={() => {
              if (onLoadMore) onLoadMore();
              else change(current + 1);
            }}
          >
            {`Show ${Math.min(size, remaining)} more`}
          </Button>
        )
      ) : (
        <PaginationContent>
          {step("previous")}
          {variant === "compact" ? (
            <PaginationItem>
              <span className={styles.pageOf}>
                Page {current} of {pages}
              </span>
            </PaginationItem>
          ) : (
            paginationPages(current, pages).map((value, index) => (
              <PaginationItem key={value === "gap" ? `gap-${index}` : value}>
                {value === "gap" ? (
                  <PaginationEllipsis />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Page ${value}`}
                    aria-current={value === current ? "page" : undefined}
                    disabled={loading}
                    onClick={() => change(value)}
                  >
                    {value}
                  </Button>
                )}
              </PaginationItem>
            ))
          )}
          {step("next")}
        </PaginationContent>
      );
    return (
      <nav
        ref={ref}
        aria-label={label}
        data-slot="pagination"
        data-variant={variant}
        className={cn(
          children === undefined ? styles.root : "mx-auto flex w-full justify-center",
          className
        )}
        {...props}
      >
        {children === undefined ? (
          <>
            <span role="status" className={styles.range}>
              {loading && variant !== "more" && <Spinner />}
              {range}
            </span>
            {!empty && (
              <div className={styles.controls}>
                {pageSizeOptions && onPageSizeChange && (
                  <div className={styles.pageSize}>
                    {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor names the Select trigger button by its id. */}
                    <label htmlFor={sizeId}>Rows per page</label>
                    <Select
                      id={sizeId}
                      size="sm"
                      value={String(size)}
                      disabled={loading}
                      options={[...new Set([...pageSizeOptions, size])]
                        .filter((value) => Number.isInteger(value) && value > 0)
                        .sort((a, b) => a - b)
                        .map((value) => ({ value: String(value), label: String(value) }))}
                      onValueChange={(value) => {
                        onPageSizeChange(Number(value));
                        if (page === undefined) setOwnPage(1);
                        onPageChange?.(1);
                      }}
                    />
                  </div>
                )}
                {controls}
              </div>
            )}
          </>
        ) : (
          children
        )}
      </nav>
    );
  }
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
  React.ComponentRef<"ul">,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => {
  return (
    <ul
      ref={ref}
      data-slot="pagination-content"
      className={cn(styles.content, className)}
      {...props}
    />
  );
});
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
  React.ComponentRef<"li">,
  React.ComponentPropsWithoutRef<"li">
>(({ ...props }, ref) => {
  return <li ref={ref} data-slot="pagination-item" {...props} />;
});
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = { isActive?: boolean } & Pick<
  React.ComponentProps<typeof Button>,
  "size"
> &
  React.ComponentPropsWithoutRef<"a">;
const PaginationLink = React.forwardRef<HTMLAnchorElement, PaginationLinkProps>(
  ({ className, isActive, size = "icon", href, onClick, ...props }, ref) => {
    const disabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
    return (
      <Button
        asChild
        variant="ghost"
        size={size}
        className={cn(disabled && styles.unavailable, className)}
      >
        <a
          ref={ref}
          aria-current={isActive ? "page" : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
          role={props.role ?? (disabled ? "link" : undefined)}
          href={disabled ? undefined : href}
          tabIndex={disabled ? -1 : props.tabIndex}
          onClick={(event) => {
            if (disabled) event.preventDefault();
            else onClick?.(event);
          }}
        />
      </Button>
    );
  }
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = React.forwardRef<
  React.ComponentRef<typeof PaginationLink>,
  React.ComponentPropsWithoutRef<typeof PaginationLink> & { text?: string }
>(({ className, text = "Previous", ...props }, ref) => {
  return (
    <PaginationLink
      ref={ref}
      aria-label="Go to previous page"
      className={cn(styles.step, className)}
      {...props}
      size="default"
    >
      <Icon name="chev-left" />
      <span className={styles.stepLabel}>{text}</span>
    </PaginationLink>
  );
});
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = React.forwardRef<
  React.ComponentRef<typeof PaginationLink>,
  React.ComponentPropsWithoutRef<typeof PaginationLink> & { text?: string }
>(({ className, text = "Next", ...props }, ref) => {
  return (
    <PaginationLink
      ref={ref}
      aria-label="Go to next page"
      className={cn(styles.step, className)}
      {...props}
      size="default"
    >
      <span className={styles.stepLabel}>{text}</span>
      <Icon name="chev-right" />
    </PaginationLink>
  );
});
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(styles.ellipsis, className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More pages</span>
    </span>
  );
});
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
};
