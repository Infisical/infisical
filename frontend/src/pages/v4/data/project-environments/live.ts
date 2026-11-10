import {
  useCreateWsEnvironment,
  useDeleteWsEnvironment,
  useRestoreEnvironment,
  useUpdateWsEnvironment
} from "@app/hooks/api/projects/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import { useProjectById } from "../projectQuery";
import type { ProjectEnvironmentsAdapter } from "./contract";

export const projectEnvironmentsLive: ProjectEnvironmentsAdapter = {
  useProject: useProjectById,
  useEnvironmentLimit: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data?.environmentLimit, isPending, error };
  },
  useCreateEnvironment: useCreateWsEnvironment,
  useUpdateEnvironment: useUpdateWsEnvironment,
  useDeleteEnvironment: useDeleteWsEnvironment,
  useRestoreEnvironment
};
