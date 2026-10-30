import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";

export const PageTitle = ({ title }: { title: string }) => {
  const { t, ready } = useTranslation(undefined, { useSuspense: false });
  // Read from the router state rather than useParams, which throws in the router's pending
  // component because it renders outside any route match.
  const projectId = useRouterState({
    select: (state) => {
      const params = state.matches[state.matches.length - 1]?.params;
      return params && "projectId" in params ? params.projectId : "";
    }
  });

  // Only reads the project the route layout already loaded, so a title never sends a request of its own.
  const { data: project } = useQuery({
    queryKey: projectKeys.getProjectById(projectId),
    queryFn: () => fetchProjectById(projectId),
    enabled: false
  });

  if (project?.name) {
    // Locale files are served immutable for 30 days, so a cached copy can predate this key. The
    // default stays a template so the project name is interpolated, never parsed as one.
    return (
      <title>
        {ready
          ? t("common.head-title-project", {
              title,
              project: project.name,
              defaultValue: "{{title}} · {{project}} | Infisical"
            })
          : `${title} · ${project.name} | Infisical`}
      </title>
    );
  }

  return <title>{ready ? t("common.head-title", { title }) : `${title} | Infisical`}</title>;
};
