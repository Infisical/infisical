import { useDeleteWorkspace, useUpdateProject } from "@app/hooks/api/projects/queries";

import { useProjectById } from "../projectQuery";
import type { ProjectSettingsAdapter } from "./contract";

export const projectSettingsLive: ProjectSettingsAdapter = {
  useProject: useProjectById,
  useUpdateProject,
  useDeleteProject: useDeleteWorkspace
};
