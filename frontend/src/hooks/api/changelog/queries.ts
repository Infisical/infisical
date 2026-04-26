import { useQuery } from "@tanstack/react-query";

import { type ChangelogFeed } from "./types";

const CHANGELOG_FEED_URL = "https://infisical.com/api/changelog-feed";

export const changelogKeys = {
  feed: () => [{ scope: "changelog-feed" }] as const
};

const fetchChangelogFeed = async (): Promise<ChangelogFeed> => {
  const response = await fetch(CHANGELOG_FEED_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch changelog: ${response.status}`);
  }

  return response.json() as Promise<ChangelogFeed>;
};

export const useGetChangelogFeed = () =>
  useQuery({
    queryKey: changelogKeys.feed(),
    queryFn: fetchChangelogFeed,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
    refetchOnWindowFocus: false
  });
