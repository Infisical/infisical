import { Link } from "@tanstack/react-router";
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
  CardTitle
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
      r.pamResources.length +
      r.pamDiscoverySources.length +
      r.kubernetesAuths.length +
      r.mcpServers.length +
      r.pkiDiscoveryConfigs.length
    : 0;

const ResourceRow = ({
  name,
  subtitle,
  to,
  params,
  isLast
}: {
  name: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
  isLast?: boolean;
}) => (
  <Link
    to={to as "/"}
    params={params}
    className={`flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-mineshaft-700/30 ${
      !isLast ? "border-b border-mineshaft-600" : ""
    }`}
  >
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-mineshaft-100">{name}</span>
      <span className="text-xs text-mineshaft-400">{subtitle}</span>
    </div>
    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
  </Link>
);

export const GatewayConnectedResourcesSection = ({ gatewayId }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayConnectedResources(gatewayId);

  const total = totalCountOf(resources);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Resources</CardTitle>
        <CardDescription>Resources currently routing through this gateway</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" />
          </div>
        )}
        {!isPending && total === 0 && (
          <p className="text-sm text-mineshaft-300">No resources connected to this gateway.</p>
        )}
        {!isPending && total > 0 && (
          <Accordion type="multiple">
            {(resources?.appConnections.length ?? 0) > 0 && (
              <AccordionItem value="app-connections">
                <AccordionTrigger>
                  <span className="flex-1">App Connections</span>
                  <Badge variant="neutral">{resources?.appConnections.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.appConnections.map((c, i) => (
                    <ResourceRow
                      key={c.id}
                      name={c.name}
                      subtitle={
                        c.projectName ? `${c.app} · ${c.projectName}` : `${c.app} · Organization`
                      }
                      to="/organizations/$orgId/app-connections/"
                      params={{ orgId: currentOrg.id }}
                      isLast={i === (resources?.appConnections.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.dynamicSecrets.length ?? 0) > 0 && (
              <AccordionItem value="dynamic-secrets">
                <AccordionTrigger>
                  <span className="flex-1">Dynamic Secrets</span>
                  <Badge variant="neutral">{resources?.dynamicSecrets.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.dynamicSecrets.map((d, i) => (
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
                      isLast={i === (resources?.dynamicSecrets.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.pamResources.length ?? 0) > 0 && (
              <AccordionItem value="pam-resources">
                <AccordionTrigger>
                  <span className="flex-1">PAM Resources</span>
                  <Badge variant="neutral">{resources?.pamResources.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.pamResources.map((r, i) => (
                    <ResourceRow
                      key={r.id}
                      name={r.name}
                      subtitle={`${r.resourceType} · ${r.projectName}`}
                      to="/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId"
                      params={{
                        orgId: currentOrg.id,
                        projectId: r.projectId,
                        resourceType: r.resourceType,
                        resourceId: r.id
                      }}
                      isLast={i === (resources?.pamResources.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.pamDiscoverySources.length ?? 0) > 0 && (
              <AccordionItem value="pam-discovery">
                <AccordionTrigger>
                  <span className="flex-1">Discovery Sources</span>
                  <Badge variant="neutral">{resources?.pamDiscoverySources.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.pamDiscoverySources.map((s, i) => (
                    <ResourceRow
                      key={s.id}
                      name={s.name}
                      subtitle={`${s.discoveryType} · ${s.projectName}`}
                      to="/organizations/$orgId/projects/pam/$projectId/discovery/$discoveryType/$discoverySourceId"
                      params={{
                        orgId: currentOrg.id,
                        projectId: s.projectId,
                        discoveryType: s.discoveryType,
                        discoverySourceId: s.id
                      }}
                      isLast={i === (resources?.pamDiscoverySources.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.kubernetesAuths.length ?? 0) > 0 && (
              <AccordionItem value="kubernetes-auth">
                <AccordionTrigger>
                  <span className="flex-1">Kubernetes Auth</span>
                  <Badge variant="neutral">{resources?.kubernetesAuths.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.kubernetesAuths.map((a, i) => (
                    <ResourceRow
                      key={a.id}
                      name={a.identityName}
                      subtitle="Kubernetes Auth"
                      to="/organizations/$orgId/identities/$identityId"
                      params={{ orgId: currentOrg.id, identityId: a.identityId }}
                      isLast={i === (resources?.kubernetesAuths.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.mcpServers.length ?? 0) > 0 && (
              <AccordionItem value="mcp-servers">
                <AccordionTrigger>
                  <span className="flex-1">MCP Servers</span>
                  <Badge variant="neutral">{resources?.mcpServers.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.mcpServers.map((s, i) => (
                    <ResourceRow
                      key={s.id}
                      name={s.name}
                      subtitle={s.projectName}
                      to="/organizations/$orgId/projects/ai/$projectId/mcp-servers/$serverId"
                      params={{ orgId: currentOrg.id, projectId: s.projectId, serverId: s.id }}
                      isLast={i === (resources?.mcpServers.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.pkiDiscoveryConfigs.length ?? 0) > 0 && (
              <AccordionItem value="pki-discovery">
                <AccordionTrigger>
                  <span className="flex-1">PKI Discovery</span>
                  <Badge variant="neutral">{resources?.pkiDiscoveryConfigs.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  {resources?.pkiDiscoveryConfigs.map((c, i) => (
                    <ResourceRow
                      key={c.id}
                      name={c.name}
                      subtitle={c.projectName}
                      to="/organizations/$orgId/projects/cert-manager/$projectId/discovery/$discoveryId"
                      params={{ orgId: currentOrg.id, projectId: c.projectId, discoveryId: c.id }}
                      isLast={i === (resources?.pkiDiscoveryConfigs.length ?? 0) - 1}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};
