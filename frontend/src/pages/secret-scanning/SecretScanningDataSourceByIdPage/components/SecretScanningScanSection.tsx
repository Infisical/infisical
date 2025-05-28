import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { SecretScanningScanTable } from "./SecretScanningScanTable";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningScanSection = ({ dataSource }: Props) => {
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Scan History</p>
      </div>
      <SecretScanningScanTable dataSource={dataSource} />
    </div>
  );
};
