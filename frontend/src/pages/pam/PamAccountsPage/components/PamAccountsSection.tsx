import { useOrganization, useProject } from "@app/context";

import { PamAccountsTable } from "./PamAccountsTable";

export const PamAccountsSection = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  return <PamAccountsTable projectId={currentProject.id} orgId={currentOrg?.id ?? ""} />;
};
