import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check, ChevronsUpDown } from "lucide-react";

import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
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
import { getCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";
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
  currentProjectName,
  showDivider
}: {
  currentType: ProjectType;
  currentProjectName?: string;
  showDivider?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { data: projects = [] } = useGetUserProjects();
  const { data: certManagerInstance, isPending: isCertManagerInstancePending } =
    useCertManagerInstanceState();

  const projectCountsByType = useMemo(
    () =>
      projects.reduce<Partial<Record<ProjectType, number>>>((counts, project) => {
        return { ...counts, [project.type]: (counts[project.type] || 0) + 1 };
      }, {}),
    [projects]
  );

  const certManagerTargetProjectId = useMemo(() => {
    const cookieValue = currentOrg?.id ? getCertManagerActiveProjectCookie(currentOrg.id) : null;
    if (cookieValue && projects.some((p) => p.id === cookieValue)) {
      return cookieValue;
    }
    return certManagerInstance?.activeProjectId ?? null;
  }, [currentOrg?.id, projects, certManagerInstance?.activeProjectId]);

  const navigateToCertManager = () => {
    if (isCertManagerInstancePending) return;
    if (certManagerTargetProjectId) {
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
        params: { orgId: currentOrg?.id || "", projectId: certManagerTargetProjectId }
      });
    } else {
      setIsCertManagerSetupOpen(true);
    }
  };

  const handleSelectType = (type: ProjectType) => {
    setOpen(false);
    const orgId = currentOrg?.id || "";

    if (type === currentType) return;

    if (type === ProjectType.CertificateManager) {
      navigateToCertManager();
      return;
    }

    if (type === ProjectType.PAM) {
      navigate({
        to: "/organizations/$orgId/pam/access",
        params: { orgId }
      });
      return;
    }

    navigate({
      to: "/organizations/$orgId/projects/$type",
      params: { orgId, type: projectTypeToUrlSlug(type) }
    });
  };

  const typeTitle = getProjectTitle(currentType);
  const pillLabel = currentProjectName ?? typeTitle;

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
              navigateToCertManager();
            } else if (currentType === ProjectType.PAM) {
              navigate({
                to: "/organizations/$orgId/pam/access",
                params: { orgId: currentOrg?.id || "" }
              });
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
          <span className="truncate">{pillLabel}</span>
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

                  return (
                    <CommandItem
                      key={type}
                      value={getProjectTitle(type)}
                      onSelect={() => handleSelectType(type)}
                      className="gap-2"
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

      <CertManagerNotConfiguredModal
        isOpen={isCertManagerSetupOpen}
        onOpenChange={setIsCertManagerSetupOpen}
      />
    </div>
  );
};

export const TypeSelect = () => {
  const params = useParams({ strict: false });
  const { pathname } = useLocation();
  const search = useSearch({ strict: false }) as { fromApplication?: string };
  const { data: projects = [] } = useGetUserProjects();
  const { data: certManagerInstance, isPending: isCertManagerInstancePending } =
    useCertManagerInstanceState();

  if (params.type && !params.projectId) {
    const resolvedType = urlSlugToProjectType(params.type);
    if (resolvedType) {
      return <TypeSelectInner currentType={resolvedType} />;
    }
  }

  if (!params.projectId && pathname.includes("/pam/")) {
    return <TypeSelectInner currentType={ProjectType.PAM} />;
  }

  if (params.projectId) {
    const project = projects.find((p) => p.id === params.projectId);
    if (project) {
      const applicationName =
        (params as { applicationName?: string }).applicationName ?? search.fromApplication;
      const hasApplicationSelect =
        project.type === ProjectType.CertificateManager && Boolean(applicationName);
      const hasSiblingProjectSelect = project.type !== ProjectType.CertificateManager;
      const isLegacyCertManagerProject =
        project.type === ProjectType.CertificateManager &&
        !isCertManagerInstancePending &&
        certManagerInstance?.activeProjectId !== project.id;
      return (
        <TypeSelectInner
          currentType={project.type}
          currentProjectName={isLegacyCertManagerProject ? project.name : undefined}
          showDivider={hasSiblingProjectSelect || hasApplicationSelect}
        />
      );
    }
  }

  return null;
};
