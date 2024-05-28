import { useEffect, useState } from "react";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Td, Tr } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

const formatDate = (date: Date): string => (date ? new Date(date).toUTCString() : "");

const isExpired = (expiresAt: Date): boolean => new Date(expiresAt) < new Date();

const getValidityStatusText = (expiresAt: Date): string =>
  isExpired(expiresAt) ? "Expired " : "Valid for ";

const timeAgo = (inputDate: Date, currentDate: Date): string => {
  const now = new Date(currentDate).getTime();
  const date = new Date(inputDate).getTime();
  const elapsedMilliseconds = now - date;
  const elapsedSeconds = Math.abs(Math.floor(elapsedMilliseconds / 1000));
  const elapsedMinutes = Math.abs(Math.floor(elapsedSeconds / 60));
  const elapsedHours = Math.abs(Math.floor(elapsedMinutes / 60));
  const elapsedDays = Math.abs(Math.floor(elapsedHours / 24));
  const elapsedWeeks = Math.abs(Math.floor(elapsedDays / 7));
  const elapsedMonths = Math.abs(Math.floor(elapsedDays / 30));
  const elapsedYears = Math.abs(Math.floor(elapsedDays / 365));

  console.log(
    elapsedYears,
    elapsedMonths,
    elapsedWeeks,
    elapsedDays,
    elapsedHours,
    elapsedMinutes,
    elapsedSeconds
  );

  if (elapsedYears > 0) {
    return `${elapsedYears} year${elapsedYears === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedMonths > 0) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedWeeks > 0) {
    return `${elapsedWeeks} week${elapsedWeeks === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedDays > 0) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedHours > 0) {
    return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedMinutes > 0) {
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  return `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} ${
    elapsedMilliseconds >= 0 ? "ago" : "from now"
  }`;
};

export const ShareSecretsRow = ({
  row,
  handlePopUpOpen,
  onSecretExpiration
}: {
  row: TSharedSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
  onSecretExpiration: (expiredSecretId: string) => void;
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (isExpired(row.expiresAt)) {
      onSecretExpiration(row.id);
    }
  }, [isExpired(row.expiresAt)]);

  return (
    <Tr key={row.id}>
      <Td>{row.name}</Td>
      <Td>
        <p className="text-sm text-yellow-400">{timeAgo(row.createdAt, currentTime)}</p>
        <p className="text-xs text-gray-500">{formatDate(row.createdAt)}</p>
      </Td>
      <Td>
        <p className={`text-sm ${isExpired(row.expiresAt) ? "text-red-500" : "text-green-500"}`}>
          {getValidityStatusText(row.expiresAt) + timeAgo(row.expiresAt, currentTime)}
        </p>
        <p className="text-xs text-gray-500">{formatDate(row.expiresAt)}</p>
      </Td>
      <Td>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Delete}
          a={ProjectPermissionSub.SecretSharing}
        >
          {(isAllowed) => (
            <IconButton
              onClick={() =>
                handlePopUpOpen("deleteSharedSecretConfirmation", {
                  name: row.name,
                  id: row.id
                })
              }
              colorSchema="danger"
              ariaLabel="delete"
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faTrashCan} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </Td>
    </Tr>
  );
};
