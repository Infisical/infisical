import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Check, ChevronsUpDown } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  getProjectLottieIcon,
  getProjectTitle,
  projectTypeToUrlSlug,
  urlSlugToProjectType
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

const TypeSelectInner = ({
  currentType,
  showDivider
}: {
  currentType: ProjectType;
  showDivider?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { data: projects = [] } = useGetUserProjects();
  const { data: certManagerInstance } = useCertManagerInstanceState();

  const projectCountsByType = useMemo(
    () =>
      projects.reduce<Partial<Record<ProjectType, number>>>((counts, project) => {
        return { ...counts, [project.type]: (counts[project.type] || 0) + 1 };
      }, {}),
    [projects]
  );

  const handleSelectType = (type: ProjectType) => {
    setOpen(false);
    const orgId = currentOrg?.id || "";

    if (type === currentType) return;

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

  const typeTitle = getProjectTitle(currentType);

  return (
    <div
      className={`flex h-full min-w-16 items-center gap-1 pr-2 pl-1 ${showDivider ? "mr-2 border-r border-border" : "mr-2"}`}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor className="absolute left-18" />
        <button
          type="button"
          onClick={() => {
            if (currentType === ProjectType.CertificateManager) {
              if (certManagerInstance?.activeProjectId) {
                navigate({
                  to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
                  params: {
                    orgId: currentOrg?.id || "",
                    projectId: certManagerInstance.activeProjectId
                  }
                });
              }
            } else {
              navigate({
                to: "/organizations/$orgId/projects/$type",
                params: { orgId: currentOrg?.id || "", type: projectTypeToUrlSlug(currentType) }
              });
            }
          }}
          className="group flex cursor-pointer items-center gap-x-2 overflow-hidden text-sm text-white"
        >
          <Lottie className="h-[14px] w-[14px] shrink-0" icon={getProjectLottieIcon(currentType)} />
          <span className="truncate">{typeTitle}</span>
        </button>
        <PopoverTrigger asChild>
          <IconButton variant="ghost" size="xs" aria-label="switch-product-type">
            <ChevronsUpDown />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={20} className="w-80 p-0">
          <Command>
            <CommandList>
              <CommandGroup heading="Products">
                {PRODUCT_TYPES.map((type) => {
                  const isCertManager = type === ProjectType.CertificateManager;
                  const count = projectCountsByType[type] || 0;
                  const isCmDisabled = isCertManager && !certManagerInstance?.activeProjectId;

                  return (
                    <CommandItem
                      key={type}
                      value={getProjectTitle(type)}
                      disabled={isCmDisabled}
                      onSelect={() => !isCmDisabled && handleSelectType(type)}
                      className={`gap-2 ${isCmDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      <Check className={currentType === type ? "opacity-100" : "opacity-0"} />
                      <Lottie className="h-4 w-4 shrink-0" icon={getProjectLottieIcon(type)} />
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <span className="truncate text-sm">{getProjectTitle(type)}</span>
                        {!isCertManager && count > 1 && (
                          <span className="text-xs text-muted">{count}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const TypeSelect = () => {
  const params = useParams({ strict: false });
  const { data: projects = [] } = useGetUserProjects();

  if (params.type && !params.projectId) {
    const resolvedType = urlSlugToProjectType(params.type);
    if (resolvedType) {
      return <TypeSelectInner currentType={resolvedType} />;
    }
  }

  if (params.projectId) {
    const project = projects.find((p) => p.id === params.projectId);
    if (project) {
      const hasApplicationSelect =
        project.type === ProjectType.CertificateManager &&
        Boolean((params as { applicationName?: string }).applicationName);
      const hasSiblingProjectSelect = project.type !== ProjectType.CertificateManager;
      return (
        <TypeSelectInner
          currentType={project.type}
          showDivider={hasSiblingProjectSelect || hasApplicationSelect}
        />
      );
    }
  }

  return null;
};
