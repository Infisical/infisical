import { useMemo } from "react";
import { faClock, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { TViewSharedSecretResponse } from "@app/hooks/api/secretSharing";

type Props = {
  secret: TViewSharedSecretResponse["secret"];
};

export const SecretShareInfo = ({ secret }: Props) => {
  const timeRemaining = useMemo(() => {
    if (!secret.expiresAt) return null;

    try {
      return format(new Date(secret.expiresAt), "yyyy-MM-dd 'at' HH:mm a");
    } catch {
      return null;
    }
  }, [secret.expiresAt]);

  const viewsRemaining = useMemo(() => {
    if (!secret.expiresAfterViews) return null;

    return secret.expiresAfterViews - 1;
  }, [secret.expiresAfterViews]);

  if (!timeRemaining && viewsRemaining === null) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-700/50 p-3 text-sm text-gray-300">
      {timeRemaining && (
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faClock} className="text-mineshaft-400" />
          <span>Expires on {timeRemaining}</span>
        </div>
      )}
      {viewsRemaining !== null && (
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faEye} className="text-mineshaft-400" />
          <span>
            {viewsRemaining === 0
              ? "This is the last time you can view this secret"
              : `${viewsRemaining} more view${viewsRemaining === 1 ? "" : "s"} remaining after this`}
          </span>
        </div>
      )}
    </div>
  );
};
