import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

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
  ItemTitle,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
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
      r.pkiDiscoveryConfigs.length +
      (r.pamAccounts?.length ?? 0) +
      (r.pamAccountTemplates?.length ?? 0)
    : 0;

const ResourceRow = ({
  name,
  subtitle,
  to,
  params,
  search,
  onClick
}: {
  name: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
  search?: Record<string, unknown>;
  onClick?: () => void;
}) => (
  <Item asChild variant="outline" size="xs">
    <Link to={to as "/"} params={params} search={search as never} onClick={onClick}>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription className="text-muted">{subtitle}</ItemDescription>
      </ItemContent>
      <ExternalLinkIcon className="size-3.5 text-muted" />
    </Link>
  </Item>
);

export const GatewayConnectedResourcesSection = ({ gatewayId }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayConnectedResources(gatewayId);
  const { data: certManagerInstance } = useCertManagerInstanceState();

  const total = totalCountOf(resources);

  return (
    <Card className="min-w-0" aria-labelledby="gateway-connected-resources-title">
      <CardHeader>
        <CardTitle>
          <h2 id="gateway-connected-resources-title">Connected Resources</h2>
        </CardTitle>
        <CardDescription>Resources currently routing through this gateway</CardDescription>
      </CardHeader>
      <CardContent>
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
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
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
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
                  <ItemGroup>
                    {resources?.dynamicSecrets.map((d) => (
                      <ResourceRow
                        key={d.id}
                        name={d.name}
                        subtitle={`${d.environmentSlug} · ${d.projectName}`}
                        to="/organizations/$orgId/projects/secret-management/$projectId/overview"
                        params={{
                          orgId: currentOrg.id,
                          projectId: d.projectId
                        }}
                        search={{ environments: [d.environmentSlug] }}
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
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
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

            {(resources?.pamAccounts?.length ?? 0) > 0 && (
              <AccordionItem value="pam-accounts">
                <AccordionTrigger>
                  <span className="flex-1">PAM Accounts</span>
                  <Badge variant="neutral">{resources?.pamAccounts?.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
                  <ItemGroup>
                    {resources?.pamAccounts?.map((a) => (
                      <ResourceRow
                        key={a.id}
                        name={a.name}
                        subtitle={
                          a.folderName ? `${a.accountType} · ${a.folderName}` : a.accountType
                        }
                        to="/organizations/$orgId/pam/accounts"
                        params={{ orgId: currentOrg.id }}
                        search={{ accountId: a.id }}
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}

            {(resources?.pamAccountTemplates?.length ?? 0) > 0 && (
              <AccordionItem value="pam-account-templates">
                <AccordionTrigger>
                  <span className="flex-1">PAM Account Templates</span>
                  <Badge variant="neutral">{resources?.pamAccountTemplates?.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
                  <ItemGroup>
                    {resources?.pamAccountTemplates?.map((t) => (
                      <ResourceRow
                        key={t.id}
                        name={t.name}
                        subtitle={t.type}
                        to="/organizations/$orgId/pam/templates"
                        params={{ orgId: currentOrg.id }}
                        search={{ templateId: t.id }}
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
                <AccordionContent className="group-data-[variant=default]/accordion:p-3">
                  <ItemGroup>
                    {resources?.pkiDiscoveryConfigs.map((c) => (
                      <ResourceRow
                        key={c.id}
                        name={c.name}
                        subtitle={
                          certManagerInstance?.isMultiInstance
                            ? c.projectName
                            : "Certificate Manager"
                        }
                        to="/organizations/$orgId/cert-manager/discovery/$discoveryId"
                        params={{ orgId: currentOrg.id, discoveryId: c.id }}
                        onClick={() =>
                          setCertManagerActiveProjectCookie(currentOrg.id, c.projectId)
                        }
                      />
                    ))}
                  </ItemGroup>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};
