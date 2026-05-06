import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Outlet, useMatches, useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useOrganization, useUser } from "@app/context";
import { clearLastProject } from "@app/helpers/lastProject";
import { getProjectHomePage } from "@app/helpers/project";
import { useGetUserProjects } from "@app/hooks/api";

import { ProjectCategoryOverview } from "./components/ProjectCategoryOverview";

export const ProjectsPage = () => {
  const { t } = useTranslation();
  const matches = useMatches();
  const navigate = useNavigate();
  const { isSubOrganization, currentOrg } = useOrganization();
  const { user } = useUser();

  const { projectRedirect } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
  });

  const { data: projects = [] } = useGetUserProjects();

  useEffect(() => {
    if (!projectRedirect || !projects.length) return;

    const project = projects.find((p) => p.id === projectRedirect);
    if (project) {
      navigate({
        to: getProjectHomePage(project.type, project.environments),
        params: { orgId: currentOrg?.id || "", projectId: project.id },
        replace: true
      });
    } else {
      clearLastProject(user.id, currentOrg?.id || "");
      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: currentOrg?.id || "" },
        search: {},
        replace: true
      });
    }
  }, [projectRedirect, projects]);

  const projectsRouteId =
    "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects";
  const lastMatch = matches[matches.length - 1];
  const hasChildRoute = lastMatch && lastMatch.routeId !== projectsRouteId;

  if (hasChildRoute) {
    return <Outlet />;
  }

  if (projectRedirect) {
    return null;
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
