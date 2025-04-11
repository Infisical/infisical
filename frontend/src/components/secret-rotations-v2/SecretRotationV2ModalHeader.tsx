import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

type Props = {
  type: SecretRotation;
  isConfigured: boolean;
};

export const SecretRotationV2ModalHeader = ({ type, isConfigured }: Props) => {
  const destinationDetails = SECRET_ROTATION_MAP[type];

  return (
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center text-mineshaft-300">
          {destinationDetails.name} Rotation
          <a
            target="_blank"
            href={`https://infisical.com/docs/documentation/platform/secret-rotation/${type}`}
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
            ? `Edit ${destinationDetails.name} Rotation`
            : `Rotate ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
