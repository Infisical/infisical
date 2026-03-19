import { faChevronDown, faChevronRight, faLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { Drawer, DrawerContent, Spinner } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
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

type ResourceSectionProps = {
  title: string;
  count: number;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

const ResourceSection = ({ title, count, children, icon }: ResourceSectionProps) => {
  const [isExpanded, setIsExpanded] = useToggle(true);

  if (count === 0) return null;

  return (
    <div className="border-b border-mineshaft-600 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsExpanded.toggle()}
        className="flex w-full items-center gap-2 px-1 py-3 text-left hover:bg-mineshaft-700/30"
      >
        <FontAwesomeIcon
          icon={isExpanded ? faChevronDown : faChevronRight}
          className="h-3 w-3 text-mineshaft-400"
        />
        {icon}
        <span className="flex-1 text-sm font-medium text-mineshaft-100">{title}</span>
        <span className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs text-mineshaft-300">
          {count}
        </span>
      </button>
      {isExpanded && <div className="pb-3 pl-6">{children}</div>}
    </div>
  );
};

type ResourceItemProps = {
  name: string;
  subtitle?: string;
  to?: string;
  params?: Record<string, string>;
};

const ResourceItem = ({ name, subtitle, to, params }: ResourceItemProps) => {
  const content = (
    <div className="py-1.5">
      <div className="text-sm text-mineshaft-100">{name}</div>
      {subtitle && <div className="text-xs text-mineshaft-400">{subtitle}</div>}
    </div>
  );

  if (to && params) {
    return (
      <Link
        to={to as "/"}
        params={params}
        className="-mx-2 block rounded px-2 hover:bg-mineshaft-700/50"
      >
        {content}
      </Link>
    );
  }

  return <div className="-mx-2 px-2">{content}</div>;
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

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Connected Resources"
        subTitle={gatewayName}
        className="w-[400px]"
        footerContent={
          totalCount > 0 ? (
            <div className="text-xs text-mineshaft-400">
              To delete this gateway, first remove or reassign these connected resources.
            </div>
          ) : null
        }
      >
        {isPending ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div>
            <div className="mb-4 text-sm text-mineshaft-300">
              {totalCount > 0 ? (
                <>
                  {totalCount} resource{totalCount !== 1 ? "s" : ""} connected across {typeCount}{" "}
                  type{typeCount !== 1 ? "s" : ""}
                </>
              ) : (
                "No resources connected to this gateway"
              )}
            </div>

            <div className="rounded-md border border-mineshaft-600">
              <ResourceSection
                title="App Connections"
                count={resources?.appConnections.length ?? 0}
                icon={<FontAwesomeIcon icon={faLink} className="h-3 w-3 text-primary-500" />}
              >
                {resources?.appConnections.map((conn) => (
                  <ResourceItem
                    key={conn.id}
                    name={conn.name}
                    subtitle={
                      conn.projectName
                        ? `${conn.app} · ${conn.projectName}`
                        : `${conn.app} · Organization`
                    }
                    to="/organizations/$orgId/app-connections/"
                    params={{ orgId: currentOrg.id }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="Dynamic Secrets"
                count={resources?.dynamicSecrets.length ?? 0}
                icon={<span className="text-yellow-500">✧</span>}
              >
                {resources?.dynamicSecrets.map((ds) => (
                  <ResourceItem
                    key={ds.id}
                    name={ds.name}
                    subtitle={`${ds.environmentSlug} · ${ds.projectName}`}
                    to="/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
                    params={{
                      orgId: currentOrg.id,
                      projectId: ds.projectId,
                      envSlug: ds.environmentSlug
                    }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="PAM Resources"
                count={resources?.pamResources.length ?? 0}
                icon={<span className="text-green-500">⊕</span>}
              >
                {resources?.pamResources.map((res) => (
                  <ResourceItem
                    key={res.id}
                    name={res.name}
                    subtitle={`${res.resourceType} · ${res.projectName}`}
                    to="/organizations/$orgId/projects/pam/$projectId/resources/"
                    params={{ orgId: currentOrg.id, projectId: res.projectId }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="Discovery Sources"
                count={resources?.pamDiscoverySources.length ?? 0}
                icon={<span className="text-blue-500">◎</span>}
              >
                {resources?.pamDiscoverySources.map((source) => (
                  <ResourceItem
                    key={source.id}
                    name={source.name}
                    subtitle={source.projectName}
                    to="/organizations/$orgId/projects/pam/$projectId/discovery/"
                    params={{ orgId: currentOrg.id, projectId: source.projectId }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="Kubernetes Auth"
                count={resources?.kubernetesAuths.length ?? 0}
                icon={<span className="text-purple-500">⎈</span>}
              >
                {resources?.kubernetesAuths.map((auth) => (
                  <ResourceItem
                    key={auth.id}
                    name={auth.identityName}
                    subtitle="Kubernetes Auth"
                    to="/organizations/$orgId/identities/$identityId"
                    params={{ orgId: currentOrg.id, identityId: auth.identityId }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="MCP Servers"
                count={resources?.mcpServers.length ?? 0}
                icon={<span className="text-cyan-500">⬡</span>}
              >
                {resources?.mcpServers.map((server) => (
                  <ResourceItem
                    key={server.id}
                    name={server.name}
                    subtitle={server.projectName}
                    to="/organizations/$orgId/projects/ai/$projectId/mcp-servers/$serverId"
                    params={{
                      orgId: currentOrg.id,
                      projectId: server.projectId,
                      serverId: server.id
                    }}
                  />
                ))}
              </ResourceSection>

              <ResourceSection
                title="PKI Discovery"
                count={resources?.pkiDiscoveryConfigs.length ?? 0}
                icon={<span className="text-orange-500">🔐</span>}
              >
                {resources?.pkiDiscoveryConfigs.map((config) => (
                  <ResourceItem
                    key={config.id}
                    name={config.name}
                    subtitle={config.projectName}
                    to="/organizations/$orgId/projects/cert-manager/$projectId/discovery/$discoveryId"
                    params={{
                      orgId: currentOrg.id,
                      projectId: config.projectId,
                      discoveryId: config.id
                    }}
                  />
                ))}
              </ResourceSection>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};
