import { ActivityIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import { formatBytes } from "@app/helpers/bytes";
import { TEndpointCounter, useListEndpointCounters } from "@app/hooks/api/endpoint";

const TransferMeter = ({ counter }: { counter: TEndpointCounter }) => {
  const threshold = counter.thresholdBytes ?? 0;
  // A counter with no threshold still reports bytes, so show the bar as full rather than dividing
  // by zero and rendering NaN.
  const percent = threshold > 0 ? Math.min((counter.bytesOut / threshold) * 100, 100) : 100;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{counter.ruleName}</p>
          <p className="truncate font-mono text-xs text-muted">{counter.destination}</p>
        </div>
        {counter.tripped ? (
          <Badge variant="danger">Blocked</Badge>
        ) : (
          <Badge variant="neutral">Counting</Badge>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-mineshaft-600">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            counter.tripped ? "bg-danger" : "bg-[var(--color-product-endpoint)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted">
        <span className="font-mono text-foreground">{formatBytes(counter.bytesOut)}</span>
        <span>{threshold > 0 ? `of ${formatBytes(threshold)}` : "no threshold"}</span>
      </div>
    </div>
  );
};

type Props = {
  deviceId: string;
};

// Scoped to one device on purpose. A fleet-wide list mixes every device's counters into one column
// of numbers that cannot be read, and the threshold only ever means something per device.
export const TransferCountersCard = ({ deviceId }: Props) => {
  const { data: counters, isPending } = useListEndpointCounters({ deviceId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Transfer</CardTitle>
        <CardDescription>
          How much this device has sent to each destination under a transfer limit, as measured on
          the device itself.
        </CardDescription>
      </CardHeader>

      {isPending && (
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        </CardContent>
      )}

      {!isPending && (counters ?? []).length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Nothing being measured</EmptyTitle>
              <EmptyDescription>
                Add a transfer limit rule to the network policy, then run the agent on this device.
                Its counters appear here as it reports them.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && (counters ?? []).length > 0 && (
        <div>
          {counters?.map((counter) => <TransferMeter key={counter.id} counter={counter} />)}
        </div>
      )}
    </Card>
  );
};
