import { Card, CardAction, CardContent, CardHeader, CardTitle, Skeleton } from "@app/components/v3";

const TILES = ["account", "next-charge", "what-you-pay"];
const DETAIL_ROWS = ["row-a", "row-b", "row-c"];

export const StatTilesSkeleton = () => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-4 lg:flex-row">
      {TILES.map((tile) => (
        <Card key={tile} className="flex-1 gap-2 p-4 shadow-none">
          <CardHeader>
            <CardTitle>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-16" />
              </div>
            </CardTitle>
            <CardAction>
              <Skeleton className="size-7 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <div className="flex h-7 items-center">
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="flex min-h-5 items-center">
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    <div className="flex items-start gap-2 px-1">
      <Skeleton className="mt-[2px] size-3 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
    </div>
  </div>
);

const CardSkeleton = ({ rows, hasAction = true }: { rows: string[]; hasAction?: boolean }) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-32" />
        </div>
      </CardTitle>
      {hasAction && (
        <CardAction>
          <Skeleton className="h-8 w-24 rounded-md" />
        </CardAction>
      )}
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row} className="flex h-5 items-center justify-between gap-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </CardContent>
  </Card>
);

export const BillingSectionSkeleton = () => (
  <>
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-[2fr_3fr]">
        <CardSkeleton rows={DETAIL_ROWS.slice(0, 2)} />
        <CardSkeleton rows={DETAIL_ROWS} />
      </div>
    </div>
    <CardSkeleton rows={DETAIL_ROWS} hasAction={false} />
  </>
);
