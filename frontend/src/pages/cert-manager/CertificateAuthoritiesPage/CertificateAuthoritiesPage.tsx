import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CaSection } from "./components";
import { ExternalCaSection } from "./components/ExternalCaSection";

export enum CertificateAuthorityTab {
  Internal = "internal",
  External = "external"
}

export const CertificateAuthoritiesPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const selectedTab = useSearch({
    strict: false,
    select: (search) => search.selectedTab
  });

  const updateSelectedTab = (tab: CertificateAuthorityTab) => {
    navigate({
      to: "/organizations/$orgId/cert-manager/certificate-authorities",
      params: {
        orgId: currentOrg.id
      },
      search: (prev) => ({ ...prev, selectedTab: tab })
    });
  };

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <PageTitle title="Certificate Authorities" />
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
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
