import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Spinner } from "@app/components/v2";
import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  TGatewayConnectedResources,
  useGetGatewayConnectedResources
} from "@app/hooks/api/gateways-v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayId: string;
  gatewayName: string;
};

const getTotalResourceCount = (resources: TGatewayConnectedResources | undefined): number => {
  if (!resources) return 0;
  return (
    resources.appConnections.length +
    resources.dynamicSecrets.length +
    resources.pamResources.length +
    resources.pamDiscoverySources.length +
    resources.kubernetesAuths.length +
    resources.mcpServers.length +
    resources.pkiDiscoveryConfigs.length
  );
};

const getResourceTypeCount = (resources: TGatewayConnectedResources | undefined): number => {
  if (!resources) return 0;
  let count = 0;
  if (resources.appConnections.length > 0) count += 1;
  if (resources.dynamicSecrets.length > 0) count += 1;
  if (resources.pamResources.length > 0) count += 1;
  if (resources.pamDiscoverySources.length > 0) count += 1;
  if (resources.kubernetesAuths.length > 0) count += 1;
  if (resources.mcpServers.length > 0) count += 1;
  if (resources.pkiDiscoveryConfigs.length > 0) count += 1;
  return count;
};

type ResourceRowProps = {
  name: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
  isLast?: boolean;
};

const ResourceRow = ({ name, subtitle, to, params, isLast }: ResourceRowProps) => {
  return (
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
};

export const GatewayConnectedResourcesDrawer = ({
  isOpen,
  onOpenChange,
  gatewayId,
  gatewayName
}: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayConnectedResources(isOpen ? gatewayId : "");

  const totalCount = getTotalResourceCount(resources);
  const typeCount = getResourceTypeCount(resources);

  const defaultOpenSections = [
    resources?.appConnections.length ? "app-connections" : null,
    resources?.dynamicSecrets.length ? "dynamic-secrets" : null,
    resources?.pamResources.length ? "pam-resources" : null,
    resources?.pamDiscoverySources.length ? "pam-discovery" : null,
    resources?.kubernetesAuths.length ? "kubernetes-auth" : null,
    resources?.mcpServers.length ? "mcp-servers" : null,
    resources?.pkiDiscoveryConfigs.length ? "pki-discovery" : null
  ].filter(Boolean) as string[];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="border-b border-mineshaft-600">
          <SheetTitle>Connected Resources</SheetTitle>
          <SheetDescription>{gatewayName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-4">
          {isPending ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-mineshaft-300">
                {totalCount > 0 ? (
                  <>
                    {totalCount} resource{totalCount !== 1 ? "s" : ""} connected across {typeCount}{" "}
                    type{typeCount !== 1 ? "s" : ""}
                  </>
                ) : (
                  "No resources connected to this gateway"
                )}
              </p>

              {totalCount > 0 && (
                <UnstableAccordion type="multiple" defaultValue={defaultOpenSections}>
                  {(resources?.appConnections.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="app-connections">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">App Connections</span>
                        <Badge variant="neutral">{resources?.appConnections.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.appConnections.map((conn, idx) => (
                          <ResourceRow
                            key={conn.id}
                            name={conn.name}
                            subtitle={
                              conn.projectName
                                ? `${conn.app} · ${conn.projectName}`
                                : `${conn.app} · Organization`
                            }
                            to="/organizations/$orgId/app-connections/"
                            params={{ orgId: currentOrg.id }}
                            isLast={idx === (resources?.appConnections.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.dynamicSecrets.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="dynamic-secrets">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">Dynamic Secrets</span>
                        <Badge variant="neutral">{resources?.dynamicSecrets.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.dynamicSecrets.map((ds, idx) => (
                          <ResourceRow
                            key={ds.id}
                            name={ds.name}
                            subtitle={`${ds.environmentSlug} · ${ds.projectName}`}
                            to="/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
                            params={{
                              orgId: currentOrg.id,
                              projectId: ds.projectId,
                              envSlug: ds.environmentSlug
                            }}
                            isLast={idx === (resources?.dynamicSecrets.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.pamResources.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="pam-resources">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">PAM Resources</span>
                        <Badge variant="neutral">{resources?.pamResources.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.pamResources.map((res, idx) => (
                          <ResourceRow
                            key={res.id}
                            name={res.name}
                            subtitle={`${res.resourceType} · ${res.projectName}`}
                            to="/organizations/$orgId/projects/pam/$projectId/resources/"
                            params={{ orgId: currentOrg.id, projectId: res.projectId }}
                            isLast={idx === (resources?.pamResources.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.pamDiscoverySources.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="pam-discovery">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">Discovery Sources</span>
                        <Badge variant="neutral">{resources?.pamDiscoverySources.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.pamDiscoverySources.map((source, idx) => (
                          <ResourceRow
                            key={source.id}
                            name={source.name}
                            subtitle={source.projectName}
                            to="/organizations/$orgId/projects/pam/$projectId/discovery/"
                            params={{ orgId: currentOrg.id, projectId: source.projectId }}
                            isLast={idx === (resources?.pamDiscoverySources.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.kubernetesAuths.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="kubernetes-auth">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">Kubernetes Auth</span>
                        <Badge variant="neutral">{resources?.kubernetesAuths.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.kubernetesAuths.map((auth, idx) => (
                          <ResourceRow
                            key={auth.id}
                            name={auth.identityName}
                            subtitle="Kubernetes Auth"
                            to="/organizations/$orgId/identities/$identityId"
                            params={{ orgId: currentOrg.id, identityId: auth.identityId }}
                            isLast={idx === (resources?.kubernetesAuths.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.mcpServers.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="mcp-servers">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">MCP Servers</span>
                        <Badge variant="neutral">{resources?.mcpServers.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.mcpServers.map((server, idx) => (
                          <ResourceRow
                            key={server.id}
                            name={server.name}
                            subtitle={server.projectName}
                            to="/organizations/$orgId/projects/ai/$projectId/mcp-servers/$serverId"
                            params={{
                              orgId: currentOrg.id,
                              projectId: server.projectId,
                              serverId: server.id
                            }}
                            isLast={idx === (resources?.mcpServers.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}

                  {(resources?.pkiDiscoveryConfigs.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="pki-discovery">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">PKI Discovery</span>
                        <Badge variant="neutral">{resources?.pkiDiscoveryConfigs.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.pkiDiscoveryConfigs.map((config, idx) => (
                          <ResourceRow
                            key={config.id}
                            name={config.name}
                            subtitle={config.projectName}
                            to="/organizations/$orgId/projects/cert-manager/$projectId/discovery/$discoveryId"
                            params={{
                              orgId: currentOrg.id,
                              projectId: config.projectId,
                              discoveryId: config.id
                            }}
                            isLast={idx === (resources?.pkiDiscoveryConfigs.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}
                </UnstableAccordion>
              )}
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <SheetFooter>
            <p className="text-xs text-mineshaft-400">
              To delete this gateway, first remove or reassign these connected resources.
            </p>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
