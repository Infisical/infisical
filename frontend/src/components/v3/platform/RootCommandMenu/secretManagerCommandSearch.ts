import type { TDashboardProjectSecretsQuickSearch } from "@app/hooks/api/dashboard/types";
import type { ProjectEnv } from "@app/hooks/api/projects/types";

import type { SecretManagerResourceSlug } from "../SecretManagerResources/SecretManagerResources";

type SearchableSecretManagerResourceSlug = Extract<
  SecretManagerResourceSlug,
  "folder" | "dynamic" | "rotation" | "secret"
>;

export type SecretManagerCommandMatch = {
  id: string;
  label: string;
  breadcrumb: string;
  keywords: string[];
  environmentSlug: string;
  path: string;
  filterBy?: SearchableSecretManagerResourceSlug;
  search?: string;
  resourceType: SearchableSecretManagerResourceSlug;
};

type QuickSearchResults = Pick<
  TDashboardProjectSecretsQuickSearch,
  "folders" | "secrets" | "dynamicSecrets" | "secretRotations"
>;

const formatBreadcrumb = ({
  projectName,
  environmentName,
  path,
  resourceName
}: {
  projectName: string;
  environmentName: string;
  path: string;
  resourceName: string;
}) =>
  [projectName, environmentName, path.replace(/^\/+|\/+$/g, ""), resourceName]
    .filter(Boolean)
    .join(" / ");

const getMatchScore = (match: SecretManagerCommandMatch, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  const label = match.label.toLowerCase();

  if (label === normalizedQuery) return 100;
  if (label.startsWith(normalizedQuery)) return 80;
  if (label.includes(normalizedQuery)) return 60;
  if (match.breadcrumb.toLowerCase().includes(normalizedQuery)) return 30;
  return 0;
};

export const buildSecretManagerCommandMatches = ({
  data,
  environments,
  projectName,
  query,
  limit = 12
}: {
  data?: QuickSearchResults;
  environments: ProjectEnv[];
  projectName: string;
  query: string;
  limit?: number;
}) => {
  if (!data) return [];

  const environmentById = new Map(environments.map((environment) => [environment.id, environment]));
  const environmentBySlug = new Map(
    environments.map((environment) => [environment.slug, environment])
  );
  const matches: SecretManagerCommandMatch[] = [];

  Object.values(data.folders)
    .flat()
    .forEach((folder) => {
      const environment = environmentById.get(folder.envId);
      const environmentSlug = environment?.slug ?? folder.envId;
      matches.push({
        id: `project-resource-folder-${environmentSlug}-${folder.id}`,
        label: folder.name,
        breadcrumb: formatBreadcrumb({
          projectName,
          environmentName: environment?.name ?? environmentSlug,
          path: folder.path,
          resourceName: "Folder"
        }),
        keywords: ["folder", environmentSlug, folder.path],
        environmentSlug,
        path: folder.path,
        resourceType: "folder"
      });
    });

  Object.values(data.dynamicSecrets)
    .flat()
    .forEach((dynamicSecret) => {
      const environment = environmentBySlug.get(dynamicSecret.environment);
      matches.push({
        id: `project-resource-dynamic-${dynamicSecret.environment}-${dynamicSecret.id}`,
        label: dynamicSecret.name,
        breadcrumb: formatBreadcrumb({
          projectName,
          environmentName: environment?.name ?? dynamicSecret.environment,
          path: dynamicSecret.path,
          resourceName: "Dynamic Secret"
        }),
        keywords: ["dynamic secret", dynamicSecret.environment, dynamicSecret.path],
        environmentSlug: dynamicSecret.environment,
        path: dynamicSecret.path,
        filterBy: "dynamic",
        search: dynamicSecret.name,
        resourceType: "dynamic"
      });
    });

  Object.values(data.secretRotations)
    .flat()
    .forEach((rotation) => {
      const environmentSlug = rotation.environment.slug;
      const environment = environmentBySlug.get(environmentSlug);
      matches.push({
        id: `project-resource-rotation-${environmentSlug}-${rotation.id}`,
        label: rotation.name,
        breadcrumb: formatBreadcrumb({
          projectName,
          environmentName: environment?.name ?? rotation.environment.name,
          path: rotation.folder.path,
          resourceName: "Secret Rotation"
        }),
        keywords: ["secret rotation", environmentSlug, rotation.folder.path],
        environmentSlug,
        path: rotation.folder.path,
        filterBy: "rotation",
        search: rotation.name,
        resourceType: "rotation"
      });
    });

  Object.values(data.secrets)
    .flat()
    .forEach((secret) => {
      const environment = environmentBySlug.get(secret.env);
      const path = secret.path ?? "/";
      matches.push({
        id: `project-resource-secret-${secret.env}-${secret.id}`,
        label: secret.key,
        breadcrumb: formatBreadcrumb({
          projectName,
          environmentName: environment?.name ?? secret.env,
          path,
          resourceName: "Secret"
        }),
        keywords: ["secret", secret.env, path],
        environmentSlug: secret.env,
        path,
        filterBy: "secret",
        search: secret.key,
        resourceType: "secret"
      });
    });

  return matches
    .sort((a, b) => {
      const scoreDifference = getMatchScore(b, query) - getMatchScore(a, query);
      if (scoreDifference) return scoreDifference;
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};
