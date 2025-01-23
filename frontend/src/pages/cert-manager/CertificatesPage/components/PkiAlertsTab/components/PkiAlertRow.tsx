import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useGetPkiCollectionById } from "@app/hooks/api";
import { TPkiAlert } from "@app/hooks/api/pkiAlerts/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  alert: TPkiAlert;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiAlert", "deletePkiAlert"]>,
    data?: object
  ) => void;
};

export const PkiAlertRow = ({ alert, handlePopUpOpen }: Props) => {
  const { data: pkiCollection } = useGetPkiCollectionById(alert.pkiCollectionId || "");
  return (
    <Tr className="h-10" key={`pki-alert-${alert.id}`}>
      <Td>{alert.name}</Td>
      <Td>{alert.alertBeforeDays}</Td>
      <Td>{pkiCollection ? pkiCollection.name : "-"}</Td>
      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
              <FontAwesomeIcon size="sm" icon={faEllipsis} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-1">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.PkiAlerts}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("pkiAlert", {
                      alertId: alert.id
                    });
                  }}
                  disabled={!isAllowed}
                >
                  Edit Alert
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={ProjectPermissionSub.PkiAlerts}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    isAllowed
                      ? "hover:!bg-red-500 hover:!text-white"
                      : "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("deletePkiAlert", {
                      alertId: alert.id,
                      name: alert.name
                    });
                  }}
                  disabled={!isAllowed}
                >
                  Delete Alert
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
