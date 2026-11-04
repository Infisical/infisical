import { useParams } from "@tanstack/react-router";

import { Badge } from "@app/components/v4/ui/badge";
import { Card } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { getProjectDescription } from "@app/helpers/project";
import type { TOrgProductStats } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { productHome, products } from "../../shell/navigation";

const statsFor = (type: ProjectType, stats: TOrgProductStats): [number, string][] => {
  switch (type) {
    case ProjectType.SecretManager:
      return [
        [stats.secretManager.secretsCount, "secrets"],
        [stats.secretManager.environmentsCount, "environments"],
        [stats.secretManager.projectsCount, "projects"]
      ];
    case ProjectType.CertificateManager:
      return [
        [stats.certificateManager.certificatesCount, "certificates"],
        [stats.certificateManager.certificateAuthoritiesCount, "CAs"],
        [stats.certificateManager.signersCount, "signers"]
      ];
    case ProjectType.KMS:
      return [
        [stats.kms.keysCount, "keys"],
        [stats.kms.clientsCount, "clients"],
        [stats.kms.projectsCount, "projects"]
      ];
    case ProjectType.SecretScanning:
      return [
        [stats.secretScanning.dataSourcesCount, "data sources"],
        [stats.secretScanning.resourcesCount, "resources"],
        [stats.secretScanning.findingsCount, "findings"]
      ];
    case ProjectType.PAM:
      return [
        [stats.pam.accountsCount, "accounts"],
        [stats.pam.accountTemplatesCount, "account templates"],
        [stats.pam.foldersCount, "folders"]
      ];
    case ProjectType.AgentVault:
      return [
        [stats.agentVault.accessBundlesCount, "access bundles"],
        [stats.agentVault.servicesCount, "services"],
        [stats.agentVault.proxiesCount, "proxies"]
      ];
    default:
      return [];
  }
};

export const ProjectsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { organization } = useV4Session();
  const { data: stats } = useV4Adapter("org").useProductStats(organization.id);
  return (
    <Stack gap={32}>
      <PageHeader
        title={`${organization.isSubOrganization ? "Sub-organization" : "Organization"} overview`}
        description="Your team's complete security toolkit, organized and ready when you need them."
      />
      <Grid columns={2} gap={32}>
        {products.map((product) => (
          <Card
            key={product.type}
            footerPlacement="frame"
            title={
              <Inline gap={8} align="center">
                <Icon name={product.icon} size={18} />
                <a href={`/v4/organizations/${orgId}${productHome(product)}`}>{product.label}</a>
                {product.type === ProjectType.AgentVault && <Badge size="sm">Preview</Badge>}
              </Inline>
            }
            description={getProjectDescription(product.type)}
            footer={
              stats ? (
                <Inline gap={24}>
                  {statsFor(product.type, stats).map(([value, label]) => (
                    <span key={label}>
                      <strong>{value.toLocaleString()}</strong> {label}
                    </span>
                  ))}
                </Inline>
              ) : (
                <Skeleton width={240} height={12} />
              )
            }
          />
        ))}
      </Grid>
    </Stack>
  );
};
