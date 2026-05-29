import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { Spinner } from "@app/components/v2";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
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
    <Card>
      <CardHeader>
        <CardTitle>Connected Gateways</CardTitle>
        <CardDescription>Gateways currently routing through this relay</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" />
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
      </CardContent>
    </Card>
  );
};
