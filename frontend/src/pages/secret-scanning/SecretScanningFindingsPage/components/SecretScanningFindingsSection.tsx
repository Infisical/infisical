import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ContentLoader } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useListSecretScanningFindings } from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingsTable } from "./SecretScanningFindingsTable";

export const SecretScanningFindingsSection = () => {
  const { currentWorkspace } = useWorkspace();

  const { data: findings = [], isPending: isFindingsPending } = useListSecretScanningFindings(
    currentWorkspace.id,
    {
      refetchInterval: 30000
    }
  );

  if (isFindingsPending) return <ContentLoader />;

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1">
            <p className="text-xl font-semibold text-mineshaft-100">Findings</p>
            <a
              href="https://infisical.com/docs/documentation/platform/secret-scanning/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                <span>Docs</span>
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-[10px]"
                />
              </div>
            </a>
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
