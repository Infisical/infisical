import { useProject } from "@app/context";

import { PamResourcesTable } from "./PamResourcesTable";

export const PamResourcesSection = () => {
  const { currentProject } = useProject();

  return <PamResourcesTable projectId={currentProject.id} />;
};
