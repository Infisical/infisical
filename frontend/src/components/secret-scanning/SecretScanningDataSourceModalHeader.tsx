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
        className="bg-bunker-500 h-12 rounded-md p-2"
      />
      <div>
        <div className="text-mineshaft-300 flex items-center">
          {dataSourceDetails.name} Data Source
          <a
            target="_blank"
            href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
            className="mb-1 ml-1"
            rel="noopener noreferrer"
          >
            <div className="bg-yellow/20 text-yellow inline-block rounded-md px-1.5 text-sm opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
        </div>
        <p className="text-mineshaft-400 text-sm leading-4">
          {isConfigured ? "Edit" : "Connect a"} {dataSourceDetails.name} Data Source
        </p>
      </div>
    </div>
  );
};
