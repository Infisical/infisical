import { useParams } from "@tanstack/react-router";

import { Badge } from "@app/components/v4/ui/badge";
import { Card } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Item } from "@app/components/v4/ui/item";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import type { TOrgProductStats } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useResolveV4Href } from "../../resolveV4Href";
import { productHome, productOf, products, projectBase } from "../../shell/navigation";

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
  const { organization, projects } = useV4Session();
  const { data: stats } = useV4Adapter("org").useProductStats(organization.id);
  const resolve = useResolveV4Href();
  const demoProject =
    useV4Mode() === "demo"
      ? projects.find((project) => project.type === ProjectType.SecretManager)
      : undefined;
  return (
    <Stack gap={32}>
      <PageHeader
        title={`${organization.isSubOrganization ? "Sub-organization" : "Organization"} overview`}
      />
      {demoProject && (
        <Item
          asChild
          variant="outline"
          icon={productOf(demoProject.type).icon}
          title={demoProject.name}
          mono
          description={`Continue in ${productOf(demoProject.type).label}`}
          actions={<Icon name="chev-right" size={16} />}
        >
          <a
            href={`/v4/organizations/${orgId}${projectBase(demoProject.type, demoProject.id)}/overview`}
          >
            {demoProject.name}
          </a>
        </Item>
      )}
      <Grid columns={2} gap={32}>
        {products.map((product) => (
          <Card
            key={product.type}
            footerPlacement="frame"
            title={
              <Inline gap={8} align="center">
                <Icon name={product.icon} size={18} />
                <a href={resolve(`/v4/organizations/${orgId}${productHome(product)}`)}>
                  {product.label}
                </a>
                {product.type === ProjectType.AgentVault && <Badge size="sm">Preview</Badge>}
              </Inline>
            }
            footer={
              stats ? (
                <Inline gap={24}>
                  {statsFor(product.type, stats).map(([value, label]) => (
                    <span key={label}>
                      <strong>{value.toLocaleString()}</strong>{" "}
                      {value === 1 ? label.replace(/s$/, "") : label}
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
