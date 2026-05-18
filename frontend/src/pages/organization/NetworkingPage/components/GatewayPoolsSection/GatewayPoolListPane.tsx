import { useState } from "react";
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
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const PoolHealthDot = ({ pool }: { pool: TGatewayPool }) => {
  let color = "bg-mineshaft-400";
  let title = "Empty";
  if (pool.memberCount > 0) {
    if (pool.healthyMemberCount === pool.memberCount) {
      color = "bg-green-500";
      title = `${pool.healthyMemberCount}/${pool.memberCount} healthy`;
    } else if (pool.healthyMemberCount === 0) {
      color = "bg-red-500";
      title = `0/${pool.memberCount} healthy`;
    } else {
      color = "bg-yellow-500";
      title = `${pool.healthyMemberCount}/${pool.memberCount} healthy`;
    }
  }
  return <span title={title} className={cn("inline-block size-2 shrink-0 rounded-full", color)} />;
};

export const GatewayPoolListPane = ({ selectedId, onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const { data: pools, isPending } = useListGatewayPools({ refetchInterval: 15_000 });

  const filtered = pools
    ?.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
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
            placeholder="Search pools..."
          />
        </InputGroup>
      </div>
      <div className="thin-scrollbar flex-1 overflow-auto p-2">
        {isPending && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        )}
        {!isPending && filtered && filtered.length > 0 && (
          <ItemGroup>
            {filtered.map((pool) => (
              <Item
                key={pool.id}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-container-hover",
                  selectedId === pool.id && "bg-container-hover"
                )}
                onClick={() => onSelect(pool.id)}
              >
                <ItemContent>
                  <ItemTitle>{pool.name}</ItemTitle>
                  <ItemDescription>
                    {pool.memberCount} gateway{pool.memberCount !== 1 ? "s" : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="self-start pt-1">
                  <PoolHealthDot pool={pool} />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        {!isPending && filtered && filtered.length === 0 && (
          <div className="flex h-full items-center justify-center p-4">
            {pools?.length ? (
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
                  <EmptyTitle>No gateway pools yet</EmptyTitle>
                  <EmptyDescription>
                    Pool gateways for high availability and automatic failover.
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
