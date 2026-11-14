import { hueScope } from "@infisical/cipher/lib/hue";
import { CipherLink, type CipherLinkProps } from "@infisical/cipher/lib/link";
import { cn } from "@infisical/cipher/lib/utils";
import { Badge } from "@infisical/cipher/ui/badge";
import { Card, CardLink } from "@infisical/cipher/ui/card";
import { Halftone } from "@infisical/cipher/ui/halftone";
import { Icon } from "@infisical/cipher/ui/icon";
import { Item } from "@infisical/cipher/ui/item";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { TooltipProvider, TooltipText } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import type { TOrgProductStats } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, v4Path } from "../../links";
import { productHome, productOf, products, projectBase } from "../../shell/navigation";
import { useBlockedProducts } from "../../shell/product-access";

import styles from "./ProjectsPage.module.css";

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

const ProductStats = ({
  stats,
  link
}: {
  stats: [number, string][];
  link?: CipherLinkProps["link"];
}) => {
  const shown = stats.filter(([value]) => value > 0);
  if (!shown.length)
    return link ? (
      <CipherLink link={link} className={styles.setUp}>
        <Icon icon={ArrowRightIcon} size={14} />
        Set up now
      </CipherLink>
    ) : null;
  return (
    <Inline gap={24}>
      {shown.map(([value, label]) => (
        <span key={label}>
          <strong>{value.toLocaleString()}</strong> {value === 1 ? label.replace(/s$/, "") : label}
        </span>
      ))}
    </Inline>
  );
};

export const ProjectsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { organization, projects } = useV4Session();
  const { data: stats } = useV4Adapter("org").useProductStats(organization.id);
  const blocked = useBlockedProducts(orgId);
  const demoProject =
    useV4Mode() === "demo"
      ? projects.find((project) => project.type === ProjectType.SecretManager)
      : undefined;
  return (
    <TooltipProvider>
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
            description={`Continue in ${productOf(demoProject.type).label}`}
            actions={<Icon name="chev-right" size={16} />}
          >
            <a href={orgHref(orgId, `${projectBase(demoProject.type, demoProject.id)}/overview`)}>
              {demoProject.name}
            </a>
          </Item>
        )}
        <Grid columns={2} gap={32}>
          {products.map((product) => {
            const link = {
              to: v4Path("/organizations/$orgId/$"),
              params: { orgId, _splat: productHome(product).slice(1) }
            };
            const card = (
              <Card
                key={product.type}
                {...hueScope(product.hue)}
                className={cn(styles.productCard, blocked.has(product.type) && styles.blocked)}
                backdrop={<Halftone seed={product.type} />}
                title={
                  <Inline gap={8} align="center" className={styles.productTitle}>
                    <Icon name={product.icon} size={18} className={styles.productIcon} />
                    <CardLink disabled={blocked.has(product.type)} link={link}>
                      {product.label}
                    </CardLink>
                    {product.type === ProjectType.AgentVault && <Badge size="sm">Preview</Badge>}
                  </Inline>
                }
                description={product.blurb}
                footer={
                  <>
                    <span className={styles.backdropIcon}>
                      <Icon name={product.icon} size={112} />
                    </span>
                    {stats ? (
                      <ProductStats
                        stats={statsFor(product.type, stats)}
                        link={blocked.has(product.type) ? undefined : link}
                      />
                    ) : (
                      <Skeleton width={240} height={12} />
                    )}
                  </>
                }
              />
            );
            return blocked.has(product.type) ? (
              <TooltipText
                asChild
                key={product.type}
                content={`You don't have access to ${product.label}. Ask an organization admin for access.`}
              >
                {card}
              </TooltipText>
            ) : (
              card
            );
          })}
        </Grid>
      </Stack>
    </TooltipProvider>
  );
};
