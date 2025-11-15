import { useProject } from "@app/context";

import { PamAccountsTable } from "./PamAccountsTable";

export const PamAccountsSection = () => {
  const { currentProject } = useProject();

  return <PamAccountsTable projectId={currentProject.id} />;
};
