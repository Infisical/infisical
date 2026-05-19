import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Spinner } from "@app/components/v2";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  TGatewayPoolConnectedResources,
  useGetGatewayPoolConnectedResources
} from "@app/hooks/api/gateway-pools";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  poolId: string;
  poolName: string;
};

const getTotalResourceCount = (resources: TGatewayPoolConnectedResources | undefined): number => {
  if (!resources) return 0;
  return (
    resources.kubernetesAuths.length +
    resources.pkiDiscoveryConfigs.length +
    resources.pamDomains.length +
    resources.pamResources.length +
    resources.pamDiscoverySources.length +
    resources.appConnections.length +
    resources.dynamicSecrets.length
  );
};

type ResourceRowProps = {
  name: string;
  subtitle: string;
  to?: string;
  params?: Record<string, string>;
  isLast?: boolean;
};

const ResourceRow = ({ name, subtitle, to, params, isLast }: ResourceRowProps) => {
  const className = `flex items-center justify-between px-4 py-2.5 ${
    to ? "transition-colors hover:bg-mineshaft-700/30" : ""
  } ${!isLast ? "border-b border-mineshaft-600" : ""}`;
  const inner = (
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-mineshaft-100">{name}</span>
        <span className="text-xs text-mineshaft-400">{subtitle}</span>
      </div>
      {to ? <ExternalLinkIcon className="size-3.5 text-mineshaft-400" /> : null}
    </>
  );

  if (to && params) {
    return (
      <Link to={to as "/"} params={params} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
};

export const PoolConnectedResourcesDrawer = ({ isOpen, onOpenChange, poolId, poolName }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayPoolConnectedResources(isOpen ? poolId : "");

  const totalCount = getTotalResourceCount(resources);

  const defaultOpenSections = (
    [
      resources?.kubernetesAuths.length ? "kubernetes-auth" : null,
      resources?.pkiDiscoveryConfigs.length ? "pki-discovery" : null,
      resources?.pamDomains.length ? "pam-domains" : null,
      resources?.pamResources.length ? "pam-resources" : null,
      resources?.pamDiscoverySources.length ? "pam-discovery" : null,
      resources?.appConnections.length ? "app-connections" : null,
      resources?.dynamicSecrets.length ? "dynamic-secrets" : null
    ] as (string | null)[]
  ).filter(Boolean) as string[];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="border-b border-mineshaft-600">
          <SheetTitle>Connected Resources</SheetTitle>
          <SheetDescription>{poolName}</SheetDescription>
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
                    {totalCount} resource{totalCount !== 1 ? "s" : ""} connected
                  </>
                ) : (
                  "No resources connected to this pool"
                )}
              </p>

              {totalCount > 0 && (
                <Accordion type="multiple" defaultValue={defaultOpenSections}>
                  {(resources?.kubernetesAuths.length ?? 0) > 0 && (
                    <AccordionItem value="kubernetes-auth">
                      <AccordionTrigger>
                        <span className="flex-1">Kubernetes Auth</span>
                        <Badge variant="neutral">{resources?.kubernetesAuths.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent className="p-0">
                        {resources?.kubernetesAuths.map((auth, idx) => (
                          <ResourceRow
                            key={auth.id}
                            name={auth.identityName ?? auth.identityId}
                            subtitle="Machine Identity"
                            to="/organizations/$orgId/identities/$identityId"
                            params={{
                              orgId: currentOrg.id,
                              identityId: auth.identityId
                            }}
                            isLast={idx === (resources?.kubernetesAuths.length ?? 0) - 1}
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
                        {resources?.pkiDiscoveryConfigs.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={r.projectName ? `Project: ${r.projectName}` : "PKI Discovery"}
                            isLast={idx === (resources?.pkiDiscoveryConfigs.length ?? 0) - 1}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {(resources?.pamDomains.length ?? 0) > 0 && (
                    <AccordionItem value="pam-domains">
                      <AccordionTrigger>
                        <span className="flex-1">PAM Domains</span>
                        <Badge variant="neutral">{resources?.pamDomains.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent className="p-0">
                        {resources?.pamDomains.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={r.projectName ? `Project: ${r.projectName}` : "PAM Domain"}
                            isLast={idx === (resources?.pamDomains.length ?? 0) - 1}
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
                        {resources?.pamResources.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={`${r.resourceType}${r.projectName ? ` · ${r.projectName}` : ""}`}
                            isLast={idx === (resources?.pamResources.length ?? 0) - 1}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {(resources?.pamDiscoverySources.length ?? 0) > 0 && (
                    <AccordionItem value="pam-discovery">
                      <AccordionTrigger>
                        <span className="flex-1">PAM Discovery Sources</span>
                        <Badge variant="neutral">{resources?.pamDiscoverySources.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent className="p-0">
                        {resources?.pamDiscoverySources.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={`${r.discoveryType}${r.projectName ? ` · ${r.projectName}` : ""}`}
                            isLast={idx === (resources?.pamDiscoverySources.length ?? 0) - 1}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {(resources?.appConnections.length ?? 0) > 0 && (
                    <AccordionItem value="app-connections">
                      <AccordionTrigger>
                        <span className="flex-1">App Connections</span>
                        <Badge variant="neutral">{resources?.appConnections.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent className="p-0">
                        {resources?.appConnections.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={`${r.app}${r.projectName ? ` · ${r.projectName}` : ""}`}
                            isLast={idx === (resources?.appConnections.length ?? 0) - 1}
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
                        {resources?.dynamicSecrets.map((r, idx) => (
                          <ResourceRow
                            key={r.id}
                            name={r.name}
                            subtitle={`${r.type} · ${r.environmentSlug}${r.projectName ? ` · ${r.projectName}` : ""}`}
                            isLast={idx === (resources?.dynamicSecrets.length ?? 0) - 1}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
