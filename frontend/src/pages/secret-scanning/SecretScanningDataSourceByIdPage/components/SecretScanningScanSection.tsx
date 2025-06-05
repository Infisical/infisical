import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { SecretScanningScanTable } from "./SecretScanningScanTable";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningScanSection = ({ dataSource }: Props) => {
  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-semibold text-mineshaft-100">Scan History</p>
          <p className="text-sm text-bunker-300">
            Detailed history of when {resourceDetails.singularNoun} scans occurred and their
            findings
          </p>
        </div>
      </div>
      <SecretScanningScanTable dataSource={dataSource} />
    </div>
  );
};
