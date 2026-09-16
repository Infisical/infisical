import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import type {
  GlobalCommandMenuGroup,
  GlobalCommandMenuSearchStatus
} from "@app/components/v3/generic/Command";
import { useDebounce } from "@app/hooks";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import type { Project } from "@app/hooks/api/projects/types";

import { SECRET_MANAGER_RESOURCES } from "../SecretManagerResources/SecretManagerResources";
import { buildSecretManagerCommandMatches } from "./secretManagerCommandSearch";

const MINIMUM_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_DELAY = 300;
const SEARCH_RESULT_LIMIT = 12;
const SEARCH_RESULT_LIMIT_PER_RESOURCE = 6;

export const useSecretManagerCommandSearch = (project: Project) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim();
  const [debouncedSearch] = useDebounce(normalizedSearch, SEARCH_DEBOUNCE_DELAY);
  const isRawSearchEnabled = normalizedSearch.length >= MINIMUM_SEARCH_LENGTH;
  const isSearchEnabled = debouncedSearch.length >= MINIMUM_SEARCH_LENGTH;

  const query = useGetProjectSecretsQuickSearch(
    {
      projectId: project.id,
      secretPath: "/",
      search: debouncedSearch,
      environments: project.environments.map((environment) => environment.slug),
      tags: {},
      limit: SEARCH_RESULT_LIMIT_PER_RESOURCE,
      offset: 0
    },
    { enabled: isSearchEnabled }
  );

  const isWaitingForDebounce = isRawSearchEnabled && normalizedSearch !== debouncedSearch;
  const isLoading =
    isRawSearchEnabled && (isWaitingForDebounce || query.isFetching || query.isPlaceholderData);
  const matches = useMemo(
    () =>
      isRawSearchEnabled && isSearchEnabled && !isWaitingForDebounce && !query.isPlaceholderData
        ? buildSecretManagerCommandMatches({
            data: query.data,
            environments: project.environments,
            projectName: project.name,
            query: normalizedSearch,
            limit: SEARCH_RESULT_LIMIT
          })
        : [],
    [
      isSearchEnabled,
      isRawSearchEnabled,
      isWaitingForDebounce,
      normalizedSearch,
      project.environments,
      project.name,
      query.data,
      query.isPlaceholderData
    ]
  );

  const groups = useMemo<GlobalCommandMenuGroup[]>(
    () => [
      {
        heading: "Project resources",
        items: matches.map((match) => ({
          id: match.id,
          label: match.label,
          breadcrumb: match.breadcrumb,
          keywords: match.keywords,
          icon: SECRET_MANAGER_RESOURCES[match.resourceType].Icon,
          priority: 60,
          onSelect: () =>
            navigate({
              to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
              params: { orgId: project.orgId, projectId: project.id },
              search: {
                search: match.search,
                clearSearch: match.resourceType === "folder" ? true : undefined,
                secretPath: match.path,
                environments: [match.environmentSlug],
                filterBy: match.filterBy
              }
            })
        }))
      }
    ],
    [matches, navigate, project.id, project.orgId]
  );

  let searchStatus: GlobalCommandMenuSearchStatus = { state: "idle" };
  if (isLoading) {
    searchStatus = { state: "loading", message: "Searching project resources…" };
  } else if (isRawSearchEnabled && isSearchEnabled && query.isError) {
    searchStatus = { state: "error", message: "Could not search project resources." };
  }

  return { groups, searchStatus, onSearchChange: setSearch };
};
