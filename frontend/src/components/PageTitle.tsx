import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { getProjectTitle } from "@app/helpers/project";
import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { useImplicitProduct } from "@app/hooks/useImplicitProduct";

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
  const implicitProduct = useImplicitProduct();

  // Only reads the project the route layout already loaded, so a title never sends a request of its own.
  const { data: project } = useQuery({
    queryKey: projectKeys.getProjectById(projectId),
    queryFn: () => fetchProjectById(projectId),
    enabled: false
  });

  // Products with one project per organization never name it, so the product stands in for it,
  // unless the page title already names the product.
  const productName = implicitProduct ? getProjectTitle(implicitProduct) : undefined;
  const scope =
    project?.name ?? (productName && !title.includes(productName) ? productName : undefined);

  if (scope && scope !== title) {
    // Locale files are served immutable for 30 days, so a cached copy can predate this key. The
    // default stays a template so the scope is interpolated, never parsed as one.
    return (
      <title>
        {ready
          ? t("common.head-title-scoped", {
              title,
              scope,
              defaultValue: "{{title}} · {{scope}} | Infisical"
            })
          : `${title} · ${scope} | Infisical`}
      </title>
    );
  }

  return <title>{ready ? t("common.head-title", { title }) : `${title} | Infisical`}</title>;
};
