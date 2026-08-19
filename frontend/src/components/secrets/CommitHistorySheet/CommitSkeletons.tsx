import { Skeleton } from "@app/components/v3";

const DATE_GROUPS = ["group-a", "group-b"];
const ROWS_PER_GROUP = ["row-a", "row-b", "row-c"];
const CARDS = ["card-a", "card-b", "card-c"];

// Bars sit inside a wrapper the height of the line box they stand in for — 20px for text-sm,
// 16px for text-xs, 19px for the footer's text-sm/leading-snug label — so real content swaps
// in without shifting anything below it

const RowSkeleton = () => (
  <div className="flex items-center gap-3 rounded-md border border-border bg-container px-4 py-3">
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-52" />
      </div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
    <Skeleton className="h-4.5 w-9" />
    <div className="flex h-4 items-center">
      <Skeleton className="h-3 w-14" />
    </div>
    <Skeleton className="size-4" />
  </div>
);

const CardSkeleton = () => (
  <div className="flex h-10 items-center gap-4 rounded-md border border-border bg-container px-4">
    <Skeleton className="size-4" />
    <Skeleton className="size-4" />
    <Skeleton className="h-3.5 w-48" />
    <div className="flex-1" />
    <div className="flex h-4 items-center">
      <Skeleton className="h-3 w-24" />
    </div>
    <Skeleton className="h-4.5 w-16" />
  </div>
);

export const CommitHistorySkeleton = () => (
  <div className="flex flex-col gap-6">
    {DATE_GROUPS.map((group) => (
      <div key={group} className="flex flex-col gap-2">
        <div className="mb-1 flex items-center gap-2">
          <Skeleton className="size-4" />
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="relative flex flex-col gap-2 pl-6">
          <span aria-hidden className="absolute top-0 bottom-0 left-2 w-px bg-border" />
          {ROWS_PER_GROUP.map((row) => (
            <RowSkeleton key={row} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const CommitDetailsHeaderSkeleton = () => (
  <>
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-56" />
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-80" />
        </div>
      </div>
      <Skeleton className="h-8 w-32 rounded-md" />
    </div>
    <div className="flex items-center gap-2">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-36" />
      </div>
      <Skeleton className="h-4.5 w-24" />
    </div>
  </>
);

export const CommitRestoreHeaderSkeleton = () => (
  <>
    <div className="flex h-5 items-center">
      <Skeleton className="h-3.5 w-full max-w-2xl" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="size-4 rounded-[4px]" />
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="size-3.5 rounded-full" />
    </div>
  </>
);

export const CommitCardsSkeleton = () => (
  <div className="flex flex-1 flex-col gap-3 p-4">
    {CARDS.map((card) => (
      <CardSkeleton key={card} />
    ))}
  </div>
);

export const CommitRestoreFooterSkeleton = () => (
  <div className="flex items-end gap-2 border-t border-border p-4">
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex h-[19px] items-center">
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
    <Skeleton className="h-9 w-20 rounded-md" />
  </div>
);
