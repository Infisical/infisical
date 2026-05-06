import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Lottie } from "@app/components/v2";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  getProjectDescription,
  getProjectLottieIcon,
  getProjectTitle,
  projectTypeToUrlSlug
} from "@app/helpers/project";
import { useGetUserProjects } from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { ProjectType } from "@app/hooks/api/projects/types";

const PRODUCT_TYPES: ProjectType[] = [
  ProjectType.SecretManager,
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM
];

export const ProjectCategoryOverview = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects();
  const { data: certManagerInstance } = useCertManagerInstanceState();

  const projectCountsByType = useMemo(
    () =>
      projects.reduce<Partial<Record<ProjectType, number>>>((counts, project) => {
        return { ...counts, [project.type]: (counts[project.type] || 0) + 1 };
      }, {}),
    [projects]
  );

  const handleTileClick = (type: ProjectType) => {
    const orgId = currentOrg?.id || "";

    if (type === ProjectType.CertificateManager) {
      if (certManagerInstance?.activeProjectId) {
        navigate({
          to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
          params: { orgId, projectId: certManagerInstance.activeProjectId }
        });
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
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

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {PRODUCT_TYPES.map((type) => {
        const isCertManager = type === ProjectType.CertificateManager;
        const count = projectCountsByType[type] || 0;
        const isDisabled = isCertManager && !certManagerInstance?.activeProjectId;

        return (
          <Card
            key={type}
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            aria-disabled={isDisabled}
            onClick={() => !isDisabled && handleTileClick(type)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isDisabled) handleTileClick(type);
            }}
            className={`group relative h-auto cursor-pointer overflow-hidden px-7 transition-all duration-100 before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-mineshaft-400 before:transition-colors before:content-[''] hover:bg-card/80 hover:before:bg-primary ${
              isDisabled ? "cursor-not-allowed opacity-40" : ""
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <div className="rounded-sm border border-mineshaft-500 bg-mineshaft-600 p-1.5 shadow-inner">
                  <Lottie className="h-7 w-7 shrink-0" icon={getProjectLottieIcon(type)} />
                </div>
                {!isCertManager && count > 1 && (
                  <span className="text-xs font-normal text-accent">{count} projects</span>
                )}
              </CardTitle>
              <CardDescription className="mt-3 text-lg font-semibold text-foreground">
                {getProjectTitle(type)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-3 text-sm leading-relaxed text-accent">
                {getProjectDescription(type)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
