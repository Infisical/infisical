import {
  faFileImport,
  faFingerprint,
  faFolder,
  faKey,
  faRotate
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2";

type Props = {
  folderCount?: number;
  importCount?: number;
  secretCount?: number;
  dynamicSecretCount?: number;
  secretRotationCount?: number;
};

export const SecretTableResourceCount = ({
  folderCount = 0,
  dynamicSecretCount = 0,
  secretCount = 0,
  importCount = 0,
  secretRotationCount = 0
}: Props) => {
  return (
    <div className="flex items-center divide-x divide-border text-sm text-muted [&>*]:pr-2">
      {importCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="text-center whitespace-nowrap">
              Total import count <span className="text-center text-muted">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFileImport} className="text-import" />
            <span>{importCount}</span>
          </div>
        </Tooltip>
      )}
      {folderCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="text-center whitespace-nowrap">
              Total folder count <span className="text-center text-muted">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faFolder} className="text-folder" />
            <span>{folderCount}</span>
          </div>
        </Tooltip>
      )}
      {dynamicSecretCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="text-center whitespace-nowrap">
              Total dynamic secret count{" "}
              <span className="text-center text-muted">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faFingerprint} className="text-dynamic-secret" />
            <span>{dynamicSecretCount}</span>
          </div>
        </Tooltip>
      )}
      {secretRotationCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="text-center whitespace-nowrap">
              Total secret rotation count{" "}
              <span className="text-center text-muted">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faRotate} className="text-secret-rotation" />
            <span>{secretRotationCount}</span>
          </div>
        </Tooltip>
      )}
      {secretCount > 0 && (
        <Tooltip
          className="max-w-sm"
          content={
            <p className="text-center whitespace-nowrap">
              Total secret count <span className="text-center text-muted">(matching filters)</span>
            </p>
          }
        >
          <div className="flex items-center gap-2 pl-2">
            <FontAwesomeIcon icon={faKey} className="text-secret" />
            <span>{secretCount}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
};
