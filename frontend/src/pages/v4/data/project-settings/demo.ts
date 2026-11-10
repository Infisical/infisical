import type { Project, UpdateProjectDTO } from "@app/hooks/api/projects/types";

import { accessDemo } from "../access/demo";
import { createFixtureStore } from "../fixture-store";
import type { ProjectSettingsAdapter } from "./contract";

type ProjectPatch = Partial<Project> & { deleted?: boolean };

const patches = createFixtureStore<Record<string, ProjectPatch>>({});

const patchOf = ({
  newProjectName,
  newProjectDescription,
  newSlug,
  ...rest
}: Omit<UpdateProjectDTO, "projectId">): Partial<Project> => {
  const patch: Partial<Project> = { ...rest };
  if (newProjectName !== undefined) patch.name = newProjectName;
  if (newProjectDescription !== undefined) patch.description = newProjectDescription;
  if (newSlug !== undefined) patch.slug = newSlug;
  return patch;
};

const applyPatch = (projectId: string, patch: ProjectPatch) =>
  patches.update((current) => ({
    ...current,
    [projectId]: { ...current[projectId], ...patch }
  }));

export const projectSettingsDemo: ProjectSettingsAdapter = {
  useProject: (projectId) => {
    const query = accessDemo.useProject(projectId);
    const patch = patches.use()[projectId];
    if (!query.data || !patch) return query;
    const { deleted, ...rest } = patch;
    if (deleted) return { data: undefined, isPending: false, error: query.error };
    return { ...query, data: { ...query.data, ...rest } };
  },
  useUpdateProject: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, ...dto }) => {
      applyPatch(projectId, patchOf(dto));
      return { id: projectId } as Project;
    }
  }),
  useDeleteProject: () => ({
    isPending: false,
    mutateAsync: async ({ projectID }) => {
      applyPatch(projectID, { deleted: true });
      return { id: projectID } as Project;
    }
  })
};
