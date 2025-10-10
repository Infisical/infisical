import { ReactNode } from "react";
import { faCheck, faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  activeCredentials: ReactNode;
  inactiveCredentials?: ReactNode;
};

export const ViewRotationGeneratedCredentialsDisplay = ({
  activeCredentials,
  inactiveCredentials
}: Props) => {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="border-mineshaft-600 w-full border-b">
          <span className="text-mineshaft-100 text-sm">
            <FontAwesomeIcon icon={faCheck} className="text-green mr-1.5" />
            Current Credentials
          </span>
        </div>
        <p className="text-mineshaft-300 text-sm">
          The active credential set currently mapped to the rotation secrets.
        </p>
        <div className="border-mineshaft-600 bg-mineshaft-700 flex flex-col gap-x-8 gap-y-2 rounded-sm border p-2">
          {activeCredentials}
        </div>
      </div>
      {inactiveCredentials && (
        <div className="flex flex-col gap-2">
          <div className="border-mineshaft-600 w-full border-b">
            <span className="text-mineshaft-100 text-sm">
              <FontAwesomeIcon icon={faClockRotateLeft} className="text-yellow mr-1.5" />
              Retired Credentials
            </span>
          </div>
          <p className="text-mineshaft-300 text-sm">
            The retired credential set that will be revoked during the next rotation cycle.
          </p>
          <div className="border-mineshaft-600 bg-mineshaft-700 flex flex-col gap-x-8 gap-y-2 rounded-sm border p-2">
            {inactiveCredentials}
          </div>
        </div>
      )}
    </>
  );
};
