import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const HealthDot = ({
  gateway
}: {
  gateway: { isV1: boolean; heartbeat?: string | null; lastHealthCheckStatus?: string | null };
}) => {
  let color = "bg-yellow-500";
  let title = "Pending";
  if (gateway.isV1) {
    color = "bg-mineshaft-400";
    title = "v1";
  } else if (gateway.lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy) {
    color = "bg-green-500";
    title = "Healthy";
  } else if (gateway.heartbeat || gateway.lastHealthCheckStatus) {
    color = "bg-red-500";
    title = "Unreachable";
  }
  return <span title={title} className={cn("inline-block size-2 shrink-0 rounded-full", color)} />;
};

export const GatewayListPane = ({ selectedId, onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const { data: gateways, isPending } = useQuery({
    ...gatewaysQueryKeys.listWithTokens(),
    refetchInterval: 15_000
  });
  const { data: pools } = useListGatewayPools({});

  const gatewayPoolMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    pools?.forEach((pool) => {
      pool.memberGatewayIds.forEach((gwId) => {
        if (!map[gwId]) map[gwId] = [];
        map[gwId].push(pool.name);
      });
    });
    return map;
  }, [pools]);

  const filtered = gateways
    ?.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-mineshaft-600 p-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon size={14} />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gateways..."
          />
        </InputGroup>
      </div>
      <div className="thin-scrollbar flex-1 overflow-auto p-2">
        {isPending && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        )}
        {!isPending && filtered && filtered.length > 0 && (
          <ItemGroup>
            {filtered.map((gw) => {
              const poolNames = gatewayPoolMap[gw.id];
              const resourceCount =
                "connectedResourcesCount" in gw ? gw.connectedResourcesCount : 0;
              const subtitleParts: string[] = [];
              if (poolNames?.length) subtitleParts.push(poolNames.join(", "));
              subtitleParts.push(`${resourceCount} resource${resourceCount !== 1 ? "s" : ""}`);

              return (
                <Item
                  key={gw.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-container-hover",
                    selectedId === gw.id && "bg-container-hover"
                  )}
                  onClick={() => onSelect(gw.id)}
                >
                  <ItemContent>
                    <ItemTitle>{gw.name}</ItemTitle>
                    <ItemDescription className="truncate">
                      {subtitleParts.join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="self-start pt-1">
                    <HealthDot gateway={gw} />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
        {!isPending && filtered && filtered.length === 0 && (
          <div className="flex h-full items-center justify-center p-4">
            {gateways?.length ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon size={14} />
                  </EmptyMedia>
                  <EmptyTitle>No results found</EmptyTitle>
                  <EmptyDescription>Try a different search term.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No gateways yet</EmptyTitle>
                  <EmptyDescription>
                    Create a gateway to securely access private network resources.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
