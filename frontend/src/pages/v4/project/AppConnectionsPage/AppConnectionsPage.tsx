import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { AppConnectionsTable } from "../../integrations/app-connections-table";
import { orgHref, v4Path } from "../../links";

const scanningRoute = v4Path("/organizations/$orgId/secret-scanning/app-connections");

export const SecretScanningAppConnectionsPage = () => {
  const { orgId } = useParams({ from: scanningRoute });
  const { data: projectId, isPending } = useV4Adapter("secretScanning").useProjectId(orgId);
  return (
    <>
      <PageTitle title="App connections" />
      {isPending && <Loader size="page" label="Loading app connections" />}
      {!isPending && !projectId && (
        <EmptyState icon="scan-key" title="Secret Scanning is not set up" />
      )}
      {projectId && (
        <Stack gap={24}>
          <PageHeader title="App connections" />
          <AppConnectionsTable
            scope={{ kind: "project", projectId, projectType: ProjectType.SecretScanning }}
            returnTo={orgHref(orgId, "/secret-scanning/app-connections")}
          />
        </Stack>
      )}
    </>
  );
};
