import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Outlet, useMatches } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";

import { ProjectCategoryOverview } from "./components/ProjectCategoryOverview";

export const ProjectsPage = () => {
  const { t } = useTranslation();
  const matches = useMatches();
  const { isSubOrganization } = useOrganization();

  const projectsRouteId =
    "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects";
  const lastMatch = matches[matches.length - 1];
  const hasChildRoute = lastMatch && lastMatch.routeId !== projectsRouteId;

  if (hasChildRoute) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col justify-start bg-bunker-800 px-6">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Overview`}
        description="Your team's complete security toolkit — organized and ready when you need them."
      />
      <ProjectCategoryOverview />
    </div>
  );
};
