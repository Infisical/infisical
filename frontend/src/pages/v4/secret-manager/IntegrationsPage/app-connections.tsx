import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionsTable } from "../../integrations/app-connections-table";
import { orgHref } from "../../links";

export const AppConnectionsTab = ({ orgId, projectId }: { orgId: string; projectId: string }) => (
  <AppConnectionsTable
    scope={{ kind: "project", projectId, projectType: ProjectType.SecretManager }}
    returnTo={orgHref(
      orgId,
      `/projects/secret-management/${projectId}/integrations?selectedTab=app-connections`
    )}
  />
);
