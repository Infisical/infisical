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
        <div className="w-full border-b border-border">
          <span className="text-sm text-foreground">
            <FontAwesomeIcon icon={faCheck} className="mr-1.5 text-success" />
            Current Credentials
          </span>
        </div>
        <p className="text-sm text-label">
          The active credential set currently mapped to the rotation secrets.
        </p>
        <div className="flex flex-col gap-x-8 gap-y-2 rounded-sm border border-border bg-container-hover p-2">
          {activeCredentials}
        </div>
      </div>
      {inactiveCredentials && (
        <div className="flex flex-col gap-2">
          <div className="w-full border-b border-border">
            <span className="text-sm text-foreground">
              <FontAwesomeIcon icon={faClockRotateLeft} className="mr-1.5 text-warning" />
              Retired Credentials
            </span>
          </div>
          <p className="text-sm text-label">
            The retired credential set that will be revoked during the next rotation cycle.
          </p>
          <div className="flex flex-col gap-x-8 gap-y-2 rounded-sm border border-border bg-container-hover p-2">
            {inactiveCredentials}
          </div>
        </div>
      )}
    </>
  );
};
