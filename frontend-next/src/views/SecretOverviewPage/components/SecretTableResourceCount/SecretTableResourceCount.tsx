import { faFileImport, faFingerprint, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2";

type Props = {
  folderCount?: number;
  importCount?: number;
  secretCount?: number;
  dynamicSecretCount?: number;
};

export const SecretTableResourceCount = ({
  folderCount = 0,
  dynamicSecretCount = 0,
  secretCount = 0,
  importCount = 0
}: Props) => {
  return (
    <div className="flex items-center gap-2 divide-x divide-mineshaft-500 text-sm text-mineshaft-400">
      {importCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="whitespace-nowrap text-center">
              Total import count{" "}
              <span className="text-center text-mineshaft-400">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFileImport} className=" text-green-700" />
            <span>{importCount}</span>
          </div>
        </Tooltip>
      )}
      {folderCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="whitespace-nowrap text-center">
              Total folder count{" "}
              <span className="text-center text-mineshaft-400">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
            <span>{folderCount}</span>
          </div>
        </Tooltip>
      )}
      {dynamicSecretCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="whitespace-nowrap text-center">
              Total dynamic secret count{" "}
              <span className="text-center text-mineshaft-400">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
            <span>{dynamicSecretCount}</span>
          </div>
        </Tooltip>
      )}
      {secretCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="whitespace-nowrap text-center">
              Total secret count{" "}
              <span className="text-center text-mineshaft-400">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
            <span>{secretCount}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
};
