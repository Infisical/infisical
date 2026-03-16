import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistanceToNow } from "date-fns";
import { PauseIcon, RefreshCwIcon, XIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";

type Props = {
  appConnection: TAppConnection;
};

export const CrededentialRotationStatusBadge = ({ appConnection }: Props) => {
  const { isAutoRotationEnabled, rotation } = appConnection;

  if (!rotation) {
    return null;
  }

  if (!isAutoRotationEnabled) {
    return (
      <Badge variant="neutral">
        <PauseIcon />
        Auto-Rotation Disabled
      </Badge>
    );
  }

  if (rotation.rotationStatus === AppConnectionCredentialRotationStatus.Failed) {
    let errorMessage = rotation.lastRotationMessage;
    if (rotation.lastRotationMessage) {
      try {
        errorMessage = JSON.stringify(JSON.parse(rotation.lastRotationMessage), null, 2);
      } catch {
        errorMessage = rotation.lastRotationMessage;
      }
    }

    return (
      <Tooltip
        position="left"
        className="max-w-sm select-text"
        content={
          <div className="flex flex-col gap-2 py-1 whitespace-normal">
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {errorMessage}
              </div>
            </div>
            {rotation.nextRotationAt && (
              <span className="text-xs text-mineshaft-300">
                Next rotation attempt on {format(rotation.nextRotationAt, "MM/dd/yyyy")} at{" "}
                {format(rotation.nextRotationAt, "h:mm aa")}.
              </span>
            )}
          </div>
        }
      >
        <Badge variant="danger">
          <XIcon />
          Rotation Failed
        </Badge>
      </Tooltip>
    );
  }

  const daysToRotation =
    (new Date(rotation.nextRotationAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);

  return (
    <Tooltip
      className="max-w-lg"
      content={
        <>
          <span>
            Rotates on {format(rotation.nextRotationAt, "MM/dd/yyyy")} at{" "}
            {format(rotation.nextRotationAt, "h:mm aa")}
          </span>{" "}
          <span className="text-mineshaft-300">(Local Time)</span>
        </>
      }
      asChild
    >
      <Badge variant={daysToRotation >= 7 ? "info" : "warning"} className="capitalize">
        <RefreshCwIcon />
        {daysToRotation < 0
          ? "Rotating"
          : `Rotates ${formatDistanceToNow(rotation.nextRotationAt, { addSuffix: true })}`}
      </Badge>
    </Tooltip>
  );
};
