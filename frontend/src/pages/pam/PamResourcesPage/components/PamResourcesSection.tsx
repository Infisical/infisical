import { ContentLoader } from "@app/components/v2";
import { useProject } from "@app/context";
import { useListPamResources } from "@app/hooks/api/pam";

import { PamResourcesTable } from "./PamResourcesTable";

export const PamResourcesSection = () => {
  const { currentProject } = useProject();

  const { data: resources = [], isPending } = useListPamResources(currentProject.id, {
    refetchInterval: 30000
  });

  if (isPending) return <ContentLoader />;

  return <PamResourcesTable resources={resources} projectId={currentProject.id} />;
};
