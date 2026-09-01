import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ExternalCaSection } from "./components/ExternalCaSection";
import { CaSection } from "./components";

export enum CertificateAuthorityTab {
  Internal = "internal",
  External = "external"
}

export const CertificateAuthoritiesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const selectedTab = useSearch({
    strict: false,
    select: (search) => search.selectedTab
  });

  const updateSelectedTab = (tab: CertificateAuthorityTab) => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: (prev) => ({ ...prev, selectedTab: tab })
    });
  };

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-background text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Authorities" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          className="mb-6"
          scope={ProjectType.CertificateManager}
          title="Certificate Authorities"
          description="Define the trust anchors that sign your certificates: internal CAs you operate, plus external CAs you connect to."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionActions.Read}
          a={ProjectPermissionSub.CertificateAuthorities}
        >
          <Tabs
            value={selectedTab ?? CertificateAuthorityTab.Internal}
            onValueChange={(tab) => updateSelectedTab(tab as CertificateAuthorityTab)}
          >
            <TabsList variant="project" aria-label="Certificate authority sections">
              <TabsTrigger value={CertificateAuthorityTab.Internal}>Internal</TabsTrigger>
              <TabsTrigger value={CertificateAuthorityTab.External}>External</TabsTrigger>
            </TabsList>
            <TabsContent value={CertificateAuthorityTab.Internal}>
              <CaSection />
            </TabsContent>
            <TabsContent value={CertificateAuthorityTab.External}>
              <ExternalCaSection />
            </TabsContent>
          </Tabs>
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
