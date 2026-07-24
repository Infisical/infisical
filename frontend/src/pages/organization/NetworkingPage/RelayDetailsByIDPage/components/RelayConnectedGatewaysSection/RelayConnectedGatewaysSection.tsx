import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  TRelayConnectedGateway,
  useGetRelayConnectedGateways
} from "@app/hooks/api/relays/queries";

type StatusGroup = "healthy" | "unreachable" | "unregistered";

const classifyGateway = (g: TRelayConnectedGateway): StatusGroup => {
  if (!g.heartbeat) return "unregistered";
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (new Date(g.heartbeat) > oneHourAgo) return "healthy";
  return "unreachable";
};

const STATUS_CONFIG: Record<
  StatusGroup,
  { label: string; variant: "success" | "danger" | "warning" }
> = {
  healthy: { label: "Healthy", variant: "success" },
  unreachable: { label: "Unreachable", variant: "danger" },
  unregistered: { label: "Unregistered", variant: "warning" }
};

const STATUS_ORDER: StatusGroup[] = ["healthy", "unreachable", "unregistered"];

const gatewaySubtitle = (g: TRelayConnectedGateway) => {
  const parts: string[] = [];
  parts.push(`Created ${formatDistanceToNow(new Date(g.createdAt), { addSuffix: true })}`);
  if (g.heartbeat) {
    parts.push(`Last seen ${formatDistanceToNow(new Date(g.heartbeat), { addSuffix: true })}`);
  }
  return parts.join(" · ");
};

export const RelayConnectedGatewaysSection = ({ relayId }: { relayId: string }) => {
  const { currentOrg } = useOrganization();
  const { data: gateways, isPending } = useGetRelayConnectedGateways(relayId);

  const grouped = useMemo(() => {
    if (!gateways) return {};
    return gateways.reduce<Partial<Record<StatusGroup, TRelayConnectedGateway[]>>>((groups, g) => {
      const status = classifyGateway(g);
      return { ...groups, [status]: [...(groups[status] || []), g] };
    }, {});
  }, [gateways]);

  const total = gateways?.length ?? 0;

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="relay-connected-gateways-title">
      <div>
        <h2 id="relay-connected-gateways-title" className="text-base font-medium text-foreground">
          Connected Gateways
        </h2>
        <p className="mt-1 text-sm text-muted">Gateways currently routing through this relay</p>
      </div>
      <div>
        {isPending && (
          <div className="space-y-2" aria-label="Loading connected gateways">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!isPending && total === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No connected gateways</EmptyTitle>
              <EmptyDescription>
                Gateways that route through this relay will show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && total > 0 && (
          <Accordion type="multiple">
            {STATUS_ORDER.map((status) => {
              const items = grouped[status];
              if (!items || items.length === 0) return null;
              const { label, variant } = STATUS_CONFIG[status];
              return (
                <AccordionItem value={status} key={status}>
                  <AccordionTrigger>
                    <span className="flex-1">{label}</span>
                    <Badge variant={variant}>{items.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3">
                    <ItemGroup>
                      {items.map((g) => (
                        <Item asChild variant="outline" size="xs" key={g.id}>
                          <Link
                            to="/organizations/$orgId/networking/gateways/$gatewayId"
                            params={{ orgId: currentOrg.id, gatewayId: g.id }}
                          >
                            <ItemContent>
                              <ItemTitle>{g.name}</ItemTitle>
                              <ItemDescription className="text-mineshaft-400">
                                {gatewaySubtitle(g)}
                              </ItemDescription>
                            </ItemContent>
                            <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                          </Link>
                        </Item>
                      ))}
                    </ItemGroup>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </section>
  );
};
