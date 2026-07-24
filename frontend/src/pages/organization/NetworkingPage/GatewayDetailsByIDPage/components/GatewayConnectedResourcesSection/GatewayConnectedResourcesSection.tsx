import { Link } from "@tanstack/react-router";
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
  TGatewayConnectedResources,
  useGetGatewayConnectedResources
} from "@app/hooks/api/gateways-v2";

type Props = { gatewayId: string };

const totalCountOf = (r: TGatewayConnectedResources | undefined) =>
  r
    ? r.appConnections.length +
      r.dynamicSecrets.length +
      r.kubernetesAuths.length +
      r.mcpServers.length +
      r.pkiDiscoveryConfigs.length
    : 0;

const ResourceRow = ({
  name,
  subtitle,
  to,
  params
}: {
  name: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
}) => (
  <Item asChild variant="outline" size="xs">
    <Link to={to as "/"} params={params}>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription className="text-mineshaft-400">{subtitle}</ItemDescription>
      </ItemContent>
      <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
    </Link>
  </Item>
);

export const GatewayConnectedResourcesSection = ({ gatewayId }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayConnectedResources(gatewayId);

  const total = totalCountOf(resources);

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="gateway-connected-resources-title">
      <div>
        <h2
          id="gateway-connected-resources-title"
          className="text-base font-medium text-foreground"
        >
          Connected Resources
        </h2>
        <p className="mt-1 text-sm text-muted">Resources currently routing through this gateway</p>
      </div>
      <div>
        {isPending && (
          <div className="space-y-2" aria-label="Loading connected resources">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!isPending && total === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No connected resources</EmptyTitle>
              <EmptyDescription>
                Resources that route through this gateway will show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && total > 0 && (
          <Accordion type="multiple">
            {(resources?.appConnections.length ?? 0) > 0 && (
              <AccordionItem value="app-connections">
                <AccordionTrigger>
                  <span className="flex-1">App Connections</span>
                  <Badge variant="neutral">{resources?.appConnections.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-3">
                  <ItemGroup>
                    {resources?.appConnections.map((c) => (
                      <ResourceRow
                        key={c.id}
                        name={c.name}
                        subtitle={
                          c.projectName ? `${c.app} · ${c.projectName}` : `${c.app} · Organization`
                        }
                        to="/organizations/$orgId/app-connections/"
                        params={{ orgId: currentOrg.id }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.dynamicSecrets.length ?? 0) > 0 && (
              <AccordionItem value="dynamic-secrets">
                <AccordionTrigger>
                  <span className="flex-1">Dynamic Secrets</span>
                  <Badge variant="neutral">{resources?.dynamicSecrets.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-3">
                  <ItemGroup>
                    {resources?.dynamicSecrets.map((d) => (
                      <ResourceRow
                        key={d.id}
                        name={d.name}
                        subtitle={`${d.environmentSlug} · ${d.projectName}`}
                        to="/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
                        params={{
                          orgId: currentOrg.id,
                          projectId: d.projectId,
                          envSlug: d.environmentSlug
                        }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.kubernetesAuths.length ?? 0) > 0 && (
              <AccordionItem value="kubernetes-auth">
                <AccordionTrigger>
                  <span className="flex-1">Kubernetes Auth</span>
                  <Badge variant="neutral">{resources?.kubernetesAuths.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-3">
                  <ItemGroup>
                    {resources?.kubernetesAuths.map((a) => (
                      <ResourceRow
                        key={a.id}
                        name={a.identityName}
                        subtitle="Kubernetes Auth"
                        to="/organizations/$orgId/identities/$identityId"
                        params={{ orgId: currentOrg.id, identityId: a.identityId }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.mcpServers.length ?? 0) > 0 && (
              <AccordionItem value="mcp-servers">
                <AccordionTrigger>
                  <span className="flex-1">MCP Servers</span>
                  <Badge variant="neutral">{resources?.mcpServers.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-3">
                  <ItemGroup>
                    {resources?.mcpServers.map((s) => (
                      <ResourceRow
                        key={s.id}
                        name={s.name}
                        subtitle={s.projectName}
                        to="/organizations/$orgId/projects/ai/$projectId/mcp-servers/$serverId"
                        params={{ orgId: currentOrg.id, projectId: s.projectId, serverId: s.id }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.pkiDiscoveryConfigs.length ?? 0) > 0 && (
              <AccordionItem value="pki-discovery">
                <AccordionTrigger>
                  <span className="flex-1">PKI Discovery</span>
                  <Badge variant="neutral">{resources?.pkiDiscoveryConfigs.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-3">
                  <ItemGroup>
                    {resources?.pkiDiscoveryConfigs.map((c) => (
                      <ResourceRow
                        key={c.id}
                        name={c.name}
                        subtitle={c.projectName}
                        to="/organizations/$orgId/projects/cert-manager/$projectId/discovery/$discoveryId"
                        params={{ orgId: currentOrg.id, projectId: c.projectId, discoveryId: c.id }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    </section>
  );
};
