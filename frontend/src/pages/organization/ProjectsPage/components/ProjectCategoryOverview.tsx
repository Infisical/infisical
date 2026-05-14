import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileKeyIcon, LockIcon, ScanSearchIcon, UsersIcon, VaultIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getProjectDescription, getProjectTitle, projectTypeToUrlSlug } from "@app/helpers/project";
import { useGetOrgProductStats, useGetUserProjects } from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

const PRODUCT_TYPES: ProjectType[] = [
  ProjectType.SecretManager,
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM
];

const getProductIcon = (type: ProjectType) => {
  const iconProps = { className: "h-6 w-6 text-org" };

  switch (type) {
    case ProjectType.SecretManager:
      return <VaultIcon {...iconProps} />;
    case ProjectType.CertificateManager:
      return <FileKeyIcon {...iconProps} />;
    case ProjectType.KMS:
      return <LockIcon {...iconProps} />;
    case ProjectType.SecretScanning:
      return <ScanSearchIcon {...iconProps} />;
    case ProjectType.PAM:
      return <UsersIcon {...iconProps} />;
    default:
      return <VaultIcon {...iconProps} />;
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
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects();
  const { data: certManagerInstance } = useCertManagerInstanceState();
  const { data: productStats } = useGetOrgProductStats(currentOrg?.id ?? "");
  const orgAdminAccessProject = useOrgAdminAccessProject();

  const [isRequestAccessOpen, setIsRequestAccessOpen] = useState(false);
  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);

  const certManagerActiveProjectId = certManagerInstance?.activeProjectId ?? null;
  const certManagerActiveProject = useMemo(
    () =>
      certManagerActiveProjectId
        ? certManagerInstance?.projects.find((p) => p.id === certManagerActiveProjectId)
        : undefined,
    [certManagerInstance, certManagerActiveProjectId]
  );
  const isMemberOfCertManagerProject = useMemo(
    () =>
      certManagerActiveProjectId
        ? projects.some((p) => p.id === certManagerActiveProjectId)
        : false,
    [projects, certManagerActiveProjectId]
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
          { label: "resources", value: productStats.pam.resourcesCount },
          { label: "projects", value: productStats.pam.projectsCount }
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

  const handleTileClick = async (type: ProjectType) => {
    const orgId = currentOrg?.id || "";

    if (type === ProjectType.CertificateManager) {
      if (!certManagerActiveProjectId) {
        setIsCertManagerSetupOpen(true);
        return;
      }
      if (isMemberOfCertManagerProject) {
        navigateToCertManager(certManagerActiveProjectId);
        return;
      }
      const isOrgAdmin = permission.can(
        OrgPermissionAdminConsoleAction.AccessAllProjects,
        OrgPermissionSubjects.AdminConsole
      );
      if (isOrgAdmin) {
        try {
          await orgAdminAccessProject.mutateAsync({ projectId: certManagerActiveProjectId });
          navigateToCertManager(certManagerActiveProjectId);
        } catch (err) {
          createNotification({
            type: "error",
            text:
              err instanceof Error ? err.message : "Failed to join the Certificate Manager project."
          });
        }
      } else {
        setIsRequestAccessOpen(true);
      }
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
              <Skeleton className="h-10 w-10" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const requestAccessProject: Project | undefined = certManagerActiveProject
    ? ({
        id: certManagerActiveProject.id,
        name: certManagerActiveProject.name
      } as Project)
    : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {PRODUCT_TYPES.map((type) => {
          const stats = getStatsForType(type);

          return (
            <Card
              key={type}
              role="button"
              tabIndex={0}
              onClick={() => handleTileClick(type)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTileClick(type);
              }}
              className="h-auto cursor-pointer transition-all duration-100 hover:bg-card/80"
            >
              <CardHeader>
                <CardTitle className="flex items-start justify-between">
                  <div className="rounded-md border border-org/20 bg-org/10 p-2">
                    {getProductIcon(type)}
                  </div>
                </CardTitle>
                <CardDescription className="mt-2 text-lg font-semibold text-foreground">
                  {getProjectTitle(type)}
                </CardDescription>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-accent">
                  {getProjectDescription(type)}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {stats.length > 0 && (
                  <div className="flex items-center gap-4 border-t border-mineshaft-600 pt-3">
                    {stats.map((stat, index) => (
                      <div key={stat.label} className="flex items-center gap-4">
                        <span className="text-mineshaft-400">
                          <span className="font-medium text-white">{formatNumber(stat.value)}</span>{" "}
                          <span className="text-sm">{stat.label}</span>
                        </span>
                        {index < stats.length - 1 && <div className="h-4 w-px bg-mineshaft-500" />}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RequestProjectAccessModal
        isOpen={isRequestAccessOpen}
        onOpenChange={setIsRequestAccessOpen}
        project={requestAccessProject}
        subTitle="Requesting access to Certificate Manager. You may include an optional note for admins to review your request."
      />

      <CertManagerNotConfiguredModal
        isOpen={isCertManagerSetupOpen}
        onOpenChange={setIsCertManagerSetupOpen}
      />
    </>
  );
};
