import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { PreviewBadge } from "@app/components/agent-vault/PreviewBadge";
import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import { Command, CommandGroup, CommandItem, CommandList } from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  resolveCertManagerProjectId,
  setCertManagerActiveProjectCookie
} from "@app/helpers/certManagerActiveProject";
import {
  getOrgScopedProductFromPath,
  getProjectHomePage,
  getProjectLucideIcon,
  getProjectTitle,
  isOrgScopedProduct,
  projectTypeToUrlSlug,
  urlSlugToProjectType
} from "@app/helpers/project";
import { useImplicitProjectId } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  NavbarSwitcher,
  NavbarSwitcherContent,
  NavbarSwitcherTrigger
} from "@app/layouts/NavbarSwitcher";

import { ProductPlanBadge } from "./ProductPlanBadge";

const PRODUCT_TYPES: ProjectType[] = [
  ProjectType.SecretManager,
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AgentVault
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

  const certManagerTargetProjectId = useMemo(
    () =>
      resolveCertManagerProjectId({
        orgId: currentOrg.id,
        activeProjectId: certManagerInstance?.activeProjectId ?? null,
        memberProjectIds: projects.map((p) => p.id)
      }),
    [currentOrg.id, projects, certManagerInstance?.activeProjectId]
  );

  const navigateToCertManager = () => {
    if (isCertManagerInstancePending) return;
    if (certManagerTargetProjectId) {
      setCertManagerActiveProjectCookie(currentOrg.id, certManagerTargetProjectId);
      navigate({
        to: "/organizations/$orgId/cert-manager/overview",
        params: { orgId: currentOrg?.id || "" }
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

    if (isOrgScopedProduct(type)) {
      navigate({
        to: getProjectHomePage(type, []),
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
  const ProductIcon = getProjectLucideIcon(currentType);

  return (
    <div
      className={`flex h-full min-w-16 items-center gap-1 pr-2 pl-1 ${showDivider ? "mr-2 border-r border-border-soft" : "mr-2"}`}
    >
      <NavbarSwitcher open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => {
            if (currentType === ProjectType.CertificateManager) {
              navigateToCertManager();
            } else if (isOrgScopedProduct(currentType)) {
              navigate({
                to: getProjectHomePage(currentType, []),
                params: { orgId: currentOrg?.id || "" }
              });
            } else {
              navigate({
                to: "/organizations/$orgId/projects/$type",
                params: { orgId: currentOrg?.id || "", type: projectTypeToUrlSlug(currentType) }
              });
            }
          }}
          className="group grid min-w-min cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 overflow-hidden text-sm text-foreground-inverse"
        >
          <ProductIcon className="h-[14px] w-[14px] shrink-0" />
          <span className="truncate">{pillLabel}</span>
          <ProductPlanBadge type={currentType} />
        </button>
        <PreviewBadge type={currentType} />
        <NavbarSwitcherTrigger aria-label="switch-product-type" />
        <NavbarSwitcherContent className="w-80">
          <Command>
            <CommandList>
              <CommandGroup heading="Products">
                {PRODUCT_TYPES.map((type) => {
                  const isCertManager = type === ProjectType.CertificateManager;
                  const count = projectCountsByType[type] || 0;
                  const ItemIcon = getProjectLucideIcon(type);

                  return (
                    <CommandItem
                      key={type}
                      value={getProjectTitle(type)}
                      onSelect={() => handleSelectType(type)}
                      className="gap-2"
                    >
                      <Check className={currentType === type ? "opacity-100" : "opacity-0"} />
                      <ItemIcon className="h-4 w-4 shrink-0" />
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
        </NavbarSwitcherContent>
      </NavbarSwitcher>

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
  const implicitProjectId = useImplicitProjectId();
  const { data: projects = [] } = useGetUserProjects();
  const { data: certManagerInstance, isPending: isCertManagerInstancePending } =
    useCertManagerInstanceState();

  if (params.type && !params.projectId) {
    const resolvedType = urlSlugToProjectType(params.type);
    if (resolvedType) {
      return <TypeSelectInner currentType={resolvedType} />;
    }
  }

  const orgScopedProduct = getOrgScopedProductFromPath(pathname);
  if (orgScopedProduct === ProjectType.CertificateManager) {
    const applicationName =
      (params as { applicationName?: string }).applicationName ?? search.fromApplication;
    const project = projects.find((p) => p.id === implicitProjectId);
    // Only orgs with several legacy instances can be viewing one that is not the active instance.
    const isLegacyCertManagerProject =
      Boolean(project) &&
      !isCertManagerInstancePending &&
      certManagerInstance?.activeProjectId !== project?.id;
    return (
      <TypeSelectInner
        currentType={ProjectType.CertificateManager}
        currentProjectName={isLegacyCertManagerProject ? project?.name : undefined}
        showDivider={Boolean(applicationName)}
      />
    );
  }

  if (!params.projectId && orgScopedProduct) {
    return <TypeSelectInner currentType={orgScopedProduct} />;
  }

  if (params.projectId) {
    const project = projects.find((p) => p.id === params.projectId);
    if (project) {
      return <TypeSelectInner currentType={project.type} showDivider />;
    }
  }

  return null;
};
