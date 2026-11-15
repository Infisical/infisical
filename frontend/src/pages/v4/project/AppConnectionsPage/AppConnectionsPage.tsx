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
import { projectBase } from "../../shell/navigation";

const ProjectAppConnections = ({
  orgId,
  projectId,
  projectType,
  returnPath
}: {
  orgId: string;
  projectId: string;
  projectType: ProjectType;
  returnPath: string;
}) => (
  <Stack gap={24}>
    <PageHeader title="App connections" />
    <AppConnectionsTable
      scope={{ kind: "project", projectId, projectType }}
      returnTo={orgHref(orgId, returnPath)}
    />
  </Stack>
);

const smRoute = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/app-connections"
);

export const AppConnectionsPage = () => {
  const { orgId, projectId } = useParams({ from: smRoute });
  return (
    <>
      <PageTitle title="App connections" />
      <ProjectAppConnections
        orgId={orgId}
        projectId={projectId}
        projectType={ProjectType.SecretManager}
        returnPath={`${projectBase(ProjectType.SecretManager, projectId)}/app-connections`}
      />
    </>
  );
};

const scanningRoute = v4Path("/organizations/$orgId/secret-scanning/app-connections");

export const SecretScanningAppConnectionsPage = () => {
  const { orgId } = useParams({ from: scanningRoute });
  const { data: projectId, isPending } = useV4Adapter("secretScanning").useProjectId(orgId);
  return (
    <>
      <PageTitle title="App connections" />
      {isPending && <Loader size="page" label="Loading app connections" />}
      {!isPending && !projectId && (
        <EmptyState icon="search" title="Secret Scanning is not set up" />
      )}
      {projectId && (
        <ProjectAppConnections
          orgId={orgId}
          projectId={projectId}
          projectType={ProjectType.SecretScanning}
          returnPath="/secret-scanning/app-connections"
        />
      )}
    </>
  );
};
