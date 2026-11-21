import type { WsTag } from "@app/hooks/api/tags/types";

import { createFixtureStore } from "../fixture-store";
import type { ProjectTagsAdapter } from "./contract";

const tag = (slug: string, color: string, createdAt: string): WsTag => ({
  id: `tag-payments-api-${slug}`,
  slug,
  color,
  projectId: "payments-api",
  createdAt,
  updatedAt: createdAt,
  __v: 0
});

const store = createFixtureStore<WsTag[]>([
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("api", "#3b82f6", "2025-01-04T12:00:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("billing", "#16a34a", "2025-01-04T12:00:00.000Z"),
  tag("config", "", "2025-02-11T09:30:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("deprecated", "#9ca3af", "2025-06-18T16:05:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("pci", "#dc2626", "2025-01-04T12:00:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("rotation-due", "#f59e0b", "2026-03-02T08:15:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("third-party", "#8b5cf6", "2025-09-27T14:40:00.000Z"),
  // v4-check-ignore raw-color -- a tag color is user data from the API
  tag("webhooks", "#0891b2", "2025-04-21T10:00:00.000Z")
]);

const assertSlugFree = (projectId: string, slug: string, exceptId?: string) => {
  if (
    store
      .get()
      .some(
        (entry) => entry.projectId === projectId && entry.slug === slug && entry.id !== exceptId
      )
  )
    throw new Error(`A tag with the slug ${slug} already exists`);
};

export const projectTagsDemo: ProjectTagsAdapter = {
  useTags: (projectId) => {
    const tags = store.use();
    return {
      data: tags.filter((entry) => entry.projectId === projectId),
      isPending: false,
      error: null
    };
  },
  useCreateTag: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, tagSlug, tagColor }) => {
      assertSlugFree(projectId, tagSlug);
      const now = new Date().toISOString();
      const created: WsTag = {
        id: `tag-${projectId}-${tagSlug}-${Date.now()}`,
        slug: tagSlug,
        color: tagColor,
        projectId,
        createdAt: now,
        updatedAt: now,
        __v: 0
      };
      store.update((tags) => [...tags, created]);
      return created;
    }
  }),
  useUpdateTag: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, tagID, tagSlug, tagColor }) => {
      assertSlugFree(projectId, tagSlug, tagID);
      const updatedAt = new Date().toISOString();
      store.update((tags) =>
        tags.map((entry) =>
          entry.id === tagID ? { ...entry, slug: tagSlug, color: tagColor, updatedAt } : entry
        )
      );
      return store.get().find((entry) => entry.id === tagID)!;
    }
  }),
  useDeleteTag: () => ({
    isPending: false,
    mutateAsync: async ({ tagID }) => {
      const removed = store.get().find((entry) => entry.id === tagID)!;
      store.update((tags) => tags.filter((entry) => entry.id !== tagID));
      return removed;
    }
  })
};
