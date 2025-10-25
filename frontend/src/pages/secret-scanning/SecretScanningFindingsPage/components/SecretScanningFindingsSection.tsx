import { ContentLoader } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { useProject } from "@app/context";
import { useListSecretScanningFindings } from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingsTable } from "./SecretScanningFindingsTable";

export const SecretScanningFindingsSection = () => {
  const { currentProject } = useProject();

  const { data: findings = [], isPending: isFindingsPending } = useListSecretScanningFindings(
    currentProject.id,
    {
      refetchInterval: 30000
    }
  );

  if (isFindingsPending) return <ContentLoader />;

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Findings</p>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/usage#findings" />
          </div>
          <p className="text-sm text-bunker-300">
            Secret leaks discovered across your data sources
          </p>
        </div>
      </div>
      <SecretScanningFindingsTable findings={findings} />
    </div>
  );
};
