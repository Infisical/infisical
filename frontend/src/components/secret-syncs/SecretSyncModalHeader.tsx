import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  destination: SecretSync;
  isConfigured: boolean;
};

export const SecretSyncModalHeader = ({ destination, isConfigured }: Props) => {
  const destinationDetails = SECRET_SYNC_MAP[destination];

  return (
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center text-mineshaft-300">
          {destinationDetails.name} Sync
          <a
            target="_blank"
            href={`https://infisical.com/docs/integrations/secret-syncs/${destination}`}
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
          {isConfigured
            ? `Edit ${destinationDetails.name} Sync`
            : `Sync secrets to ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
