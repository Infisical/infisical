import { useMemo } from "react";
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
import { formatBytes, formatTransferWindow } from "@app/helpers/bytes";
import { TEndpointCounter, useListEndpointCounters } from "@app/hooks/api/endpoint";

const TransferMeter = ({ counter }: { counter: TEndpointCounter }) => {
  const threshold = counter.thresholdBytes ?? 0;
  // A counter with no threshold still reports bytes, so show the bar as full rather than dividing
  // by zero and rendering NaN.
  const percent = threshold > 0 ? Math.min((counter.bytesOut / threshold) * 100, 100) : 100;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_auto]">
      <p className="truncate font-mono text-xs text-foreground">{counter.destination}</p>

      <div className="hidden h-2 overflow-hidden rounded-full bg-mineshaft-600 sm:block">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            counter.tripped ? "bg-danger" : "bg-[var(--color-product-endpoint)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <span className="font-mono text-xs text-muted sm:text-right">
        {formatBytes(counter.bytesOut)}
        <span className="ml-1 text-[10px] text-muted/70">
          /{formatTransferWindow(counter.ruleWindowSeconds)}
        </span>
      </span>

      {counter.tripped ? (
        <Badge variant="danger">Blocked</Badge>
      ) : (
        <Badge variant="neutral">Counting</Badge>
      )}
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

  // Grouped by rule, because a rule names no destination: the destinations under it are what the
  // device discovered at runtime, and the rule is the only thing tying them together.
  const rules = useMemo(() => {
    const byRule = new Map<
      string,
      {
        name: string;
        threshold: number;
        windowSeconds?: number | null;
        counters: TEndpointCounter[];
      }
    >();

    (counters ?? []).forEach((counter) => {
      const group = byRule.get(counter.networkRuleId) ?? {
        name: counter.ruleName,
        threshold: counter.thresholdBytes ?? 0,
        windowSeconds: counter.ruleWindowSeconds,
        counters: []
      };
      group.counters.push(counter);
      byRule.set(counter.networkRuleId, group);
    });

    return [...byRule.entries()].map(([id, group]) => ({
      id,
      ...group,
      counters: [...group.counters].sort((a, b) => b.bytesOut - a.bytesOut)
    }));
  }, [counters]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Traffic</CardTitle>
        <CardDescription>
          How much this device is currently sending to each destination, measured on the device
          itself over the rule's window. Nobody configures these: they appear as the device starts
          sending.
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

      {!isPending && rules.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Nothing being measured</EmptyTitle>
              <EmptyDescription>
                Add a transfer limit to the network policy, then run the agent on this device. Any
                destination it sends a meaningful amount to appears here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending &&
        rules.map((rule) => (
          <div key={rule.id} className="border-b border-border last:border-b-0">
            <div className="flex items-baseline justify-between gap-4 bg-mineshaft-800/40 px-4 py-2">
              <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
              <p className="shrink-0 text-xs text-muted">
                {formatBytes(rule.threshold)} per {formatTransferWindow(rule.windowSeconds)}, per
                destination
              </p>
            </div>
            <div className="divide-y divide-border">
              {rule.counters.map((counter) => (
                <TransferMeter key={counter.id} counter={counter} />
              ))}
            </div>
          </div>
        ))}
    </Card>
  );
};
