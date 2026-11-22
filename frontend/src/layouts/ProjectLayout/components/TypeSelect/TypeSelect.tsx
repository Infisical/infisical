import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { PreviewBadge } from "@app/components/agent-vault/PreviewBadge";
import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandItemLink,
  CommandList
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  resolveCertManagerProjectId,
  setCertManagerActiveProjectCookie
} from "@app/helpers/certManagerActiveProject";
import {
  getInstancePinningLink,
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
import { useGetSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2";
import {
  NavbarBlock,
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

const ORG_PRODUCT_PAGE_PATH_RE = /^\/organizations\/[^/]+\/projects\/([^/]+)\//;

const TypeSelectInner = ({
  currentType,
  currentProjectName,
  currentProjectId
}: {
  currentType: ProjectType;
  currentProjectName?: string;
  currentProjectId?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
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

  const getProductLink = (type: ProjectType) => {
    const orgId = currentOrg?.id || "";
    if (type === currentType && currentProjectId) {
      const pinnedPath = type === ProjectType.CertificateManager ? "overview" : "data-sources";
      const pinnedLink = getInstancePinningLink(orgId, { id: currentProjectId, type }, pinnedPath);
      if (pinnedLink) return pinnedLink;
    }
    if (type === ProjectType.CertificateManager) {
      if (!certManagerTargetProjectId) return null;
      return getInstancePinningLink(orgId, { id: certManagerTargetProjectId, type }, "overview");
    }
    if (isOrgScopedProduct(type)) {
      return { to: getProjectHomePage(type, []), params: { orgId } } as const;
    }
    return {
      to: "/organizations/$orgId/projects/$type",
      params: { orgId, type: projectTypeToUrlSlug(type) }
    } as const;
  };

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
  const pillLink = getProductLink(currentType);
  const pillClassName =
    "group grid min-w-min cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 overflow-hidden text-sm text-foreground-inverse";
  const pillContent = (
    <>
      <ProductIcon className="h-[14px] w-[14px] shrink-0" />
      <span className="truncate">{pillLabel}</span>
      <ProductPlanBadge type={currentType} />
    </>
  );

  return (
    <NavbarBlock className="min-w-16">
      <NavbarSwitcher
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setSelectedValue("");
          setOpen(nextOpen);
        }}
      >
        {pillLink ? (
          <Link {...pillLink} className={pillClassName}>
            {pillContent}
          </Link>
        ) : (
          <button type="button" onClick={navigateToCertManager} className={pillClassName}>
            {pillContent}
          </button>
        )}
        <PreviewBadge type={currentType} />
        <NavbarSwitcherTrigger aria-label="switch-product-type" />
        <NavbarSwitcherContent className="w-80">
          <Command value={selectedValue} onValueChange={setSelectedValue}>
            <CommandList>
              <CommandGroup heading="Products">
                {PRODUCT_TYPES.map((type) => {
                  const isCertManager = type === ProjectType.CertificateManager;
                  const count = projectCountsByType[type] || 0;
                  const ItemIcon = getProjectLucideIcon(type);
                  const itemLink = getProductLink(type);

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
                        {itemLink ? (
                          <CommandItemLink
                            {...itemLink}
                            onFocus={() => setSelectedValue(getProjectTitle(type))}
                          >
                            {getProjectTitle(type)}
                          </CommandItemLink>
                        ) : (
                          <span className="truncate text-sm">{getProjectTitle(type)}</span>
                        )}
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
    </NavbarBlock>
  );
};

export const TypeSelect = () => {
  const params = useParams({ strict: false });
  const { pathname } = useLocation();
  const implicitProjectId = useImplicitProjectId();
  const { data: projects = [] } = useGetUserProjects();
  const { data: certManagerInstance, isPending: isCertManagerInstancePending } =
    useCertManagerInstanceState();
  const { currentOrg } = useOrganization();
  const { data: secretScanningInstance } = useGetSecretScanningInstanceState(currentOrg.id);

  if (params.type && !params.projectId) {
    const resolvedType = urlSlugToProjectType(params.type);
    if (resolvedType) {
      return <TypeSelectInner currentType={resolvedType} />;
    }
  }

  const orgScopedProduct = getOrgScopedProductFromPath(pathname);
  if (orgScopedProduct === ProjectType.CertificateManager) {
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
        currentProjectId={isLegacyCertManagerProject ? project?.id : undefined}
      />
    );
  }

  if (orgScopedProduct === ProjectType.SecretScanning) {
    const project = projects.find((p) => p.id === implicitProjectId);
    const isLegacySecretScanningProject =
      Boolean(project) &&
      Boolean(secretScanningInstance?.isMultiInstance) &&
      secretScanningInstance?.activeProjectId !== project?.id;
    return (
      <TypeSelectInner
        currentType={ProjectType.SecretScanning}
        currentProjectName={isLegacySecretScanningProject ? project?.name : undefined}
        currentProjectId={isLegacySecretScanningProject ? project?.id : undefined}
      />
    );
  }

  if (!params.projectId && orgScopedProduct) {
    return <TypeSelectInner currentType={orgScopedProduct} />;
  }

  if (params.projectId) {
    const project = projects.find((p) => p.id === params.projectId);
    if (project) {
      return <TypeSelectInner currentType={project.type} />;
    }
    return null;
  }

  const orgProductSlug = pathname.match(ORG_PRODUCT_PAGE_PATH_RE)?.[1];
  const orgProductType = orgProductSlug ? urlSlugToProjectType(orgProductSlug) : null;
  if (orgProductType) {
    return <TypeSelectInner currentType={orgProductType} />;
  }

  return null;
};
