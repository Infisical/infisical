import { Badge } from "@infisical/cipher/ui/badge";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2/enums";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { FindingsTable } from "../components/findings";

const route = v4Path("/organizations/$orgId/secret-scanning/findings");

const Findings = ({ projectId }: { projectId: string }) => {
  const navigate = useNavigate({ from: route });
  const search = useSearch({ from: route });
  const { data: unresolved = 0 } =
    useV4Adapter("secretScanning").useUnresolvedFindingCount(projectId);
  const { permission, isPending } = useProjectPermission(projectId);

  const header = (
    <PageHeader
      title="Findings"
      description="Secrets detected across every data source."
      badges={
        <Inline gap={8} align="center">
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/findings" />
          {unresolved > 0 && (
            <Badge tone="warn" dot>
              {unresolved} need attention
            </Badge>
          )}
        </Inline>
      }
    />
  );

  if (isPending) return <Loader size="page" label="Loading findings" />;
  if (
    !permission.can(
      ProjectPermissionSecretScanningFindingActions.Read,
      ProjectPermissionSub.SecretScanningFindings
    )
  )
    return (
      <Stack gap={24}>
        {header}
        <AccessRestricted requirement="Read findings" />
      </Stack>
    );

  return (
    <Stack gap={24}>
      {header}
      <FindingsTable
        projectId={projectId}
        filters={{
          status: search.status ?? SecretScanningFindingStatus.Unresolved,
          dataSourceId: search.dataSourceId,
          resourceId: search.resourceId
        }}
        onFiltersChange={(change) =>
          navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })
        }
      />
    </Stack>
  );
};

export const SecretScanningFindingsPage = () => {
  const { orgId } = useParams({ from: route });
  const { data: projectId } = useV4Adapter("secretScanning").useProjectId(orgId);
  if (!projectId) return <Loader size="page" label="Loading findings" />;
  return <Findings projectId={projectId} />;
};
