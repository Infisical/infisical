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
import { useGetRelays } from "@app/hooks/api/relays";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const HealthDot = ({ heartbeat, orgId }: { heartbeat?: string; orgId?: string | null }) => {
  let color = "bg-yellow-500";
  let title = "Pending";
  if (!orgId) {
    color = "bg-mineshaft-400";
    title = "Managed";
  } else if (heartbeat) {
    const lastHeartbeat = new Date(heartbeat);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastHeartbeat > oneHourAgo) {
      color = "bg-green-500";
      title = "Healthy";
    } else {
      color = "bg-red-500";
      title = "Unreachable";
    }
  }
  return <span title={title} className={cn("inline-block size-2 shrink-0 rounded-full", color)} />;
};

export const RelayListPane = ({ selectedId, onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const { data: relays, isPending } = useGetRelays();

  const filtered = relays
    ?.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
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
            placeholder="Search relays..."
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
            {filtered.map((relay) => (
              <Item
                key={relay.id}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-container-hover",
                  selectedId === relay.id && "bg-container-hover"
                )}
                onClick={() => onSelect(relay.id)}
              >
                <ItemContent>
                  <ItemTitle>{relay.name}</ItemTitle>
                  <ItemDescription>{relay.host}</ItemDescription>
                </ItemContent>
                <ItemActions className="self-start pt-1">
                  <HealthDot heartbeat={relay.heartbeat} orgId={relay.orgId} />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        {!isPending && filtered && filtered.length === 0 && (
          <div className="flex h-full items-center justify-center p-4">
            {relays?.length ? (
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
                  <EmptyTitle>No relays yet</EmptyTitle>
                  <EmptyDescription>
                    Create a relay to route gateway traffic through your network.
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
