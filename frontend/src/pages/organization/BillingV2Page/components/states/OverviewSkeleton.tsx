import { Card, CardAction, CardContent, CardHeader, CardTitle, Skeleton } from "@app/components/v3";

// Loading placeholder mirroring the header row of stat tiles plus the products card.
export const OverviewSkeleton = () => (
  <div className="flex flex-col gap-4">
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
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-4 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-border py-4 first:border-t-0"
          >
            <Skeleton className="size-[38px] rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);
