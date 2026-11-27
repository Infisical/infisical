import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { RowLink } from "@infisical/cipher/ui/row-link";

import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

import { useOrgId } from "../../access/permissions";
import { ProviderLabel, providerOf } from "../../components/provider-label";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";

type ResourceRow = {
  id: string;
  name: string;
  type: string;
  image?: string;
  location: string;
  link: ReturnType<ReturnType<typeof useGo>["link"]>;
};

export const ConnectedResourcesCard = ({ gatewayId }: { gatewayId: string }) => {
  const orgId = useOrgId();
  const go = useGo();
  const { data: resources, isPending } = useV4Adapter("networking").useGatewayResources(gatewayId);
  const { data: certManagerInstance } = useV4Adapter("certificates").useInstanceState(orgId);
  const link = (path: string) => go.link(orgHref(orgId, path));

  const rows: ResourceRow[] = resources
    ? [
        ...resources.appConnections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          type: `App connection (${APP_CONNECTION_MAP[connection.app as AppConnection]?.name ?? connection.app})`,
          image: APP_CONNECTION_MAP[connection.app as AppConnection]?.image,
          location: connection.projectName ?? "Organization",
          link: link("/integrations")
        })),
        ...resources.dynamicSecrets.map((secret) => ({
          id: secret.id,
          name: secret.name,
          type: "Dynamic secret",
          location: `${secret.projectName} (${secret.environmentSlug})`,
          link: {
            to: v4Path(
              "/organizations/$orgId/projects/secret-management/$projectId/overview"
            ) as never,
            params: { orgId, projectId: secret.projectId } as never,
            search: { environments: [secret.environmentSlug] } as never,
            disabled: false
          }
        })),
        ...resources.kubernetesAuths.map((auth) => ({
          id: auth.id,
          name: auth.identityName,
          type: "Kubernetes Auth",
          image: providerOf("identity-auth", IdentityAuthMethod.KUBERNETES_AUTH)?.image,
          location: "Organization",
          link: link(`/identities/${auth.identityId}`)
        })),
        ...(resources.pamAccounts ?? []).map((account) => ({
          id: account.id,
          name: account.name,
          type: `PAM account (${account.accountType})`,
          location: account.folderName ?? "Organization",
          link: link(`/pam/accounts?accountId=${account.id}`)
        })),
        ...(resources.pamAccountTemplates ?? []).map((template) => ({
          id: template.id,
          name: template.name,
          type: `PAM account template (${template.type})`,
          location: "Organization",
          link: link(`/pam/templates?templateId=${template.id}`)
        })),
        ...resources.pkiDiscoveryConfigs.map((config) => ({
          id: config.id,
          name: config.name,
          type: "PKI discovery",
          location: certManagerInstance?.isMultiInstance
            ? config.projectName
            : "Certificate Manager",
          link: link(`/projects/cert-manager/${config.projectId}/discovery/${config.id}`)
        }))
      ]
    : [];

  const columns: DataTableColumn<ResourceRow>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      render: (row) => (
        <RowLink link={row.link} title={row.name}>
          {row.name}
        </RowLink>
      )
    },
    {
      id: "type",
      header: "Type",
      render: (row) => <ProviderLabel provider={{ name: row.type, image: row.image }} />
    },
    { id: "location", header: "Location", render: (row) => row.location }
  ];

  return (
    <Card variant="framed" title="Connected resources" flush>
      <DataTable
        label="Connected resources"
        rows={rows}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        filtered={false}
        empty={<EmptyState size="sm" media="bare" icon="link" title="No connected resources" />}
      />
    </Card>
  );
};
