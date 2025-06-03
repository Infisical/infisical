import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

type Props = {
  type: SecretScanningDataSource;
  isConfigured: boolean;
};

export const SecretScanningDataSourceModalHeader = ({ type, isConfigured }: Props) => {
  const dataSourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  return (
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${dataSourceDetails.name} logo`}
        src={`/images/integrations/${dataSourceDetails.image}`}
        className="h-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center text-mineshaft-300">
          {dataSourceDetails.name} Data Source
          <a
            target="_blank"
            href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
            className="mb-1 ml-1"
            rel="noopener noreferrer"
          >
            <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConfigured ? "Edit" : "Connect a"} {dataSourceDetails.name} Data Source
        </p>
      </div>
    </div>
  );
};
