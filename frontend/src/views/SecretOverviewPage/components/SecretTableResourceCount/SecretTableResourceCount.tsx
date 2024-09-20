import { faFileImport, faFingerprint, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faFileImport} className=" text-green-700" />
          <span>{importCount}</span>
        </div>
      )}
      {folderCount > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
          <span>{folderCount}</span>
        </div>
      )}
      {dynamicSecretCount > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
          <span>{dynamicSecretCount}</span>
        </div>
      )}
      {secretCount > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
          <span>{secretCount}</span>
        </div>
      )}
    </div>
  );
};
