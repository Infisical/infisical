import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionsTable } from "../../integrations/app-connections-table";
import { orgHref } from "../../links";
import { useCertManagerSettingsScope } from "./shared";

export const AppConnectionsTab = () => {
  const { orgId, projectId } = useCertManagerSettingsScope();
  return (
    <AppConnectionsTable
      scope={{ kind: "project", projectId, projectType: ProjectType.CertificateManager }}
      returnTo={orgHref(orgId, "/cert-manager/settings?selectedTab=app-connections")}
    />
  );
};
