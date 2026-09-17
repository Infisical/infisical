import { Card, CardAction, CardContent, CardHeader, CardTitle, Skeleton } from "@app/components/v3";

export const StatTilesSkeleton = () => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-4 lg:flex-row">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex-1 gap-2 p-4 shadow-none">
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-3 w-16" />
            </CardTitle>
            <CardAction>
              <Skeleton className="size-7 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-2/3" />
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
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  </div>
);

type CardSkeletonProps = { rows: number; hasAction?: boolean };

const CardSkeleton = ({ rows, hasAction = true }: CardSkeletonProps) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle>
        <Skeleton className="h-4 w-32" />
      </CardTitle>
      {hasAction && (
        <CardAction>
          <Skeleton className="h-8 w-24 rounded-md" />
        </CardAction>
      )}
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => i).map((row) => (
        <div key={row} className="flex items-center justify-between gap-4">
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
        <CardSkeleton rows={2} />
        <CardSkeleton rows={3} />
      </div>
    </div>
    <CardSkeleton rows={3} hasAction={false} />
  </>
);
