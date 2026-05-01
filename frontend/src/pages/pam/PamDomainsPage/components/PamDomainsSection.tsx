import { useProject } from "@app/context";

import { PamDomainsTable } from "./PamDomainsTable";

export const PamDomainsSection = () => {
  const { currentProject } = useProject();
  return <PamDomainsTable projectId={currentProject.id} />;
};
