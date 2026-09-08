import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import { CertManagerSelectInstanceModal } from "@app/components/projects/CertManagerSelectInstanceModal";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";
import {
  getOrgScopedProduct,
  ORG_SCOPED_PRODUCTS,
  TOrgScopedProduct
} from "@app/helpers/orgScopedProducts";
import {
  getProjectDescription,
  getProjectHomePage,
  getProjectLucideIcon,
  getProjectTitle,
  isOrgScopedProduct,
  projectTypeToUrlSlug
} from "@app/helpers/project";
import { useGetOrgProductStats, useGetUserProjects } from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import { resolveOrgScopedProjectId } from "@app/hooks/api/orgScopedProducts";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

type ActiveProducts = ProjectType;

const PRODUCT_TYPES: ActiveProducts[] = [
  ProjectType.SecretManager,
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AgentVault
];

const PRODUCT_STYLES: Record<
  ActiveProducts,
  {
    iconClassName: string;
    containerClassName: string;
    cardClassName: string;
    titleUnderlineClassName: string;
  }
> = {
  [ProjectType.SecretManager]: {
    iconClassName: "h-4.5 w-4.5 text-product-sm",
    containerClassName:
      "border-product-sm/30 bg-gradient-to-br from-product-sm/20 to-product-sm/5 group-hover:border-product-sm/50 group-hover:from-product-sm/25 group-hover:to-product-sm/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-sm/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-sm/60"
  },
  [ProjectType.CertificateManager]: {
    iconClassName: "h-4.5 w-4.5 text-product-pki",
    containerClassName:
      "border-product-pki/30 bg-gradient-to-br from-product-pki/20 to-product-pki/5 group-hover:border-product-pki/50 group-hover:from-product-pki/25 group-hover:to-product-pki/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-pki/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-pki/60"
  },
  [ProjectType.KMS]: {
    iconClassName: "h-4.5 w-4.5 text-product-kms",
    containerClassName:
      "border-product-kms/30 bg-gradient-to-br from-product-kms/20 to-product-kms/5 group-hover:border-product-kms/50 group-hover:from-product-kms/25 group-hover:to-product-kms/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-kms/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-kms/60"
  },
  [ProjectType.SecretScanning]: {
    iconClassName: "h-4.5 w-4.5 text-product-ss",
    containerClassName:
      "border-product-ss/30 bg-gradient-to-br from-product-ss/20 to-product-ss/5 group-hover:border-product-ss/50 group-hover:from-product-ss/25 group-hover:to-product-ss/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-ss/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-ss/60"
  },
  [ProjectType.PAM]: {
    iconClassName: "h-4.5 w-4.5 text-product-pam",
    containerClassName:
      "border-product-pam/30 bg-gradient-to-br from-product-pam/20 to-product-pam/5 group-hover:border-product-pam/50 group-hover:from-product-pam/25 group-hover:to-product-pam/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-pam/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-pam/60"
  },
  [ProjectType.AgentVault]: {
    iconClassName: "h-4.5 w-4.5 text-product-av",
    containerClassName:
      "border-product-av/30 bg-gradient-to-br from-product-av/20 to-product-av/5 group-hover:border-product-av/50 group-hover:from-product-av/25 group-hover:to-product-av/10",
    cardClassName: "hover:bg-gradient-to-br hover:from-product-av/[0.04] hover:to-transparent",
    titleUnderlineClassName: "decoration-product-av/60"
  }
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

type ProductStat = {
  label: string;
  value: number;
};

export const ProjectCategoryOverview = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const canRequestAccess = permission.can(
    OrgPermissionProjectActions.RequestAccess,
    OrgPermissionSubjects.Project
  );
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects();
  const { data: certManagerInstance } = useCertManagerInstanceState();
  const { data: productStats } = useGetOrgProductStats(currentOrg?.id ?? "");
  const orgAdminAccessProject = useOrgAdminAccessProject();

  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);
  const [isCertManagerPickerOpen, setIsCertManagerPickerOpen] = useState(false);
  const [accessRequest, setAccessRequest] = useState<{
    projectId: string;
    productLabel: string;
  } | null>(null);

  const orgDefaultCertManagerProjectId = certManagerInstance?.activeProjectId ?? null;
  const cmInstances = useMemo(
    () => certManagerInstance?.projects ?? [],
    [certManagerInstance?.projects]
  );

  const isOrgAdmin = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  const isCertManagerMember = useMemo(
    () => cmInstances.some((instance) => projects.some((project) => project.id === instance.id)),
    [cmInstances, projects]
  );
  const isCertManagerAccessBlocked =
    cmInstances.length > 0 && !isOrgAdmin && !canRequestAccess && !isCertManagerMember;

  const blockedOrgScopedProducts = useMemo(
    () =>
      new Set<ProjectType>(
        Object.values(ORG_SCOPED_PRODUCTS)
          .filter(({ projectIdField }) => {
            const projectId = currentOrg?.[projectIdField];
            return (
              Boolean(projectId) &&
              !isOrgAdmin &&
              !canRequestAccess &&
              !projects.some((project) => project.id === projectId)
            );
          })
          .map(({ type }) => type)
      ),
    [currentOrg, projects, isOrgAdmin, canRequestAccess]
  );

  const getStatsForType = (type: ProjectType): ProductStat[] => {
    if (!productStats) return [];

    switch (type) {
      case ProjectType.SecretManager:
        return [
          { label: "secrets", value: productStats.secretManager.secretsCount },
          { label: "environments", value: productStats.secretManager.environmentsCount },
          { label: "projects", value: productStats.secretManager.projectsCount }
        ];
      case ProjectType.CertificateManager:
        return [
          { label: "certificates", value: productStats.certificateManager.certificatesCount },
          { label: "CAs", value: productStats.certificateManager.certificateAuthoritiesCount },
          { label: "signers", value: productStats.certificateManager.signersCount }
        ];
      case ProjectType.KMS:
        return [
          { label: "keys", value: productStats.kms.keysCount },
          { label: "clients", value: productStats.kms.clientsCount },
          { label: "projects", value: productStats.kms.projectsCount }
        ];
      case ProjectType.SecretScanning:
        return [
          { label: "data sources", value: productStats.secretScanning.dataSourcesCount },
          { label: "resources", value: productStats.secretScanning.resourcesCount },
          { label: "projects", value: productStats.secretScanning.projectsCount }
        ];
      case ProjectType.PAM:
        return [
          { label: "accounts", value: productStats.pam.accountsCount },
          { label: "account templates", value: productStats.pam.accountTemplatesCount },
          { label: "folders", value: productStats.pam.foldersCount }
        ];
      case ProjectType.AgentVault:
        return [
          { label: "access bundles", value: productStats.agentVault.accessBundlesCount },
          { label: "connections", value: productStats.agentVault.connectionsCount },
          { label: "proxies", value: productStats.agentVault.proxiesCount }
        ];
      default:
        return [];
    }
  };

  const navigateToCertManager = (projectId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
      params: { orgId: currentOrg?.id ?? "", projectId }
    });
  };

  const enterCertManagerProject = async (projectId: string) => {
    const isMember = projects.some((p) => p.id === projectId);
    if (isMember) {
      navigateToCertManager(projectId);
      return;
    }
    if (isOrgAdmin) {
      try {
        await orgAdminAccessProject.mutateAsync({ projectId });
        navigateToCertManager(projectId);
      } catch (err) {
        createNotification({
          type: "error",
          text:
            err instanceof Error ? err.message : "Failed to join the Certificate Manager project."
        });
      }
    } else if (canRequestAccess) {
      setAccessRequest({
        projectId,
        productLabel: getProjectTitle(ProjectType.CertificateManager)
      });
    } else {
      createNotification({
        type: "error",
        text: "You don't have access to this Certificate Manager project."
      });
    }
  };

  const handleCertManagerInstanceSelect = async (projectId: string) => {
    if (currentOrg?.id) setCertManagerActiveProjectCookie(currentOrg.id, projectId);
    setIsCertManagerPickerOpen(false);
    await enterCertManagerProject(projectId);
  };

  const enterOrgScopedProduct = async (product: TOrgScopedProduct) => {
    const productLabel = getProjectTitle(product.type);
    const navigateToProduct = () =>
      navigate({
        to: getProjectHomePage(product.type, []),
        params: { orgId: currentOrg?.id ?? "" }
      });

    let projectId: string;
    try {
      // Also lazily bootstraps the project for orgs that don't have one yet.
      projectId = await resolveOrgScopedProjectId(currentOrg, product);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : `Failed to resolve the ${productLabel} project.`
      });
      return;
    }

    if (projects.some((p) => p.id === projectId)) {
      navigateToProduct();
      return;
    }

    if (isOrgAdmin) {
      try {
        await orgAdminAccessProject.mutateAsync({ projectId });
        navigateToProduct();
      } catch (err) {
        createNotification({
          type: "error",
          text: err instanceof Error ? err.message : `Failed to join the ${productLabel} project.`
        });
      }
      return;
    }

    if (canRequestAccess) {
      setAccessRequest({ projectId, productLabel });
      return;
    }

    createNotification({
      type: "error",
      text: `You don't have access to ${productLabel}.`
    });
  };

  const handleTileClick = async (type: ProjectType) => {
    const orgId = currentOrg?.id || "";

    if (type === ProjectType.CertificateManager) {
      if (cmInstances.length === 0) {
        setIsCertManagerSetupOpen(true);
        return;
      }
      if (cmInstances.length > 1) {
        setIsCertManagerPickerOpen(true);
        return;
      }
      const onlyId = cmInstances[0].id;
      await enterCertManagerProject(onlyId);
      return;
    }

    const orgScopedProduct = getOrgScopedProduct(type);
    if (orgScopedProduct) {
      await enterOrgScopedProduct(orgScopedProduct);
      return;
    }

    navigate({
      to: "/organizations/$orgId/projects/$type",
      params: { orgId, type: projectTypeToUrlSlug(type) }
    });
  };

  if (isProjectsLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={`tile-loading-${i + 1}`}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-3 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // The modal only reads id, and name only for a subtitle every caller overrides.
  const accessRequestProject: Project | undefined = accessRequest
    ? ({ id: accessRequest.projectId, name: accessRequest.productLabel } as Project)
    : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {PRODUCT_TYPES.map((type) => {
          const stats = getStatsForType(type);
          const { iconClassName, containerClassName, cardClassName, titleUnderlineClassName } =
            PRODUCT_STYLES[type];
          const Icon = getProjectLucideIcon(type);

          const tileBody = (
            <>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 rounded-sm border p-1.5 transition-colors duration-200 ${containerClassName}`}
                  >
                    <Icon className={iconClassName} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardDescription className="text-base font-semibold text-foreground">
                      <span
                        className={`underline decoration-[1.5px] underline-offset-4 ${titleUnderlineClassName}`}
                      >
                        {getProjectTitle(type)}
                      </span>
                    </CardDescription>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-accent">
                      {getProjectDescription(type)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {stats.length > 0 && (
                  <div className="flex items-center gap-4 border-t border-border pt-3">
                    {stats.map((stat, index) => (
                      <div key={stat.label} className="flex items-center gap-4">
                        <span className="text-muted">
                          <span className="text-sm font-medium text-foreground">
                            {formatNumber(stat.value)}
                          </span>{" "}
                          <span className="text-xs">{stat.label}</span>
                        </span>
                        {index < stats.length - 1 && <div className="h-4 w-px bg-border" />}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </>
          );

          const isAccessBlocked =
            (type === ProjectType.CertificateManager && isCertManagerAccessBlocked) ||
            blockedOrgScopedProducts.has(type);

          if (isAccessBlocked) {
            return (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <div aria-disabled className="cursor-not-allowed">
                    <Card className="h-auto rounded-md opacity-50">{tileBody}</Card>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  You don&apos;t have access to {getProjectTitle(type)}. Ask an organization admin
                  for access.
                </TooltipContent>
              </Tooltip>
            );
          }

          const tileClassName = `group h-auto cursor-pointer rounded-md transition-all duration-200 ease-out hover:scale-[1.01] ${cardClassName}`;

          // Cert Manager and the org-scoped products resolve their destination asynchronously
          // (instance picker, lazy project bootstrap, join-on-behalf), so they stay handler-driven.
          if (type === ProjectType.CertificateManager || isOrgScopedProduct(type)) {
            return (
              <Card
                key={type}
                role="button"
                tabIndex={0}
                onClick={() => handleTileClick(type)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTileClick(type);
                }}
                className={tileClassName}
              >
                {tileBody}
              </Card>
            );
          }

          return (
            <Link
              key={type}
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: currentOrg?.id || "", type: projectTypeToUrlSlug(type) }}
              className="block"
            >
              <Card className={tileClassName}>{tileBody}</Card>
            </Link>
          );
        })}
      </div>

      <RequestProjectAccessModal
        isOpen={Boolean(accessRequest)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAccessRequest(null);
        }}
        project={accessRequestProject}
        subTitle={
          accessRequest
            ? `Requesting access to ${accessRequest.productLabel}. You may include an optional note for admins to review your request.`
            : undefined
        }
      />

      <CertManagerNotConfiguredModal
        isOpen={isCertManagerSetupOpen}
        onOpenChange={setIsCertManagerSetupOpen}
      />

      <CertManagerSelectInstanceModal
        isOpen={isCertManagerPickerOpen}
        onOpenChange={setIsCertManagerPickerOpen}
        instances={cmInstances}
        orgDefaultProjectId={orgDefaultCertManagerProjectId}
        onSelect={handleCertManagerInstanceSelect}
      />
    </>
  );
};
