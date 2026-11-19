import { MoreHorizontalIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
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
    <TableRow key={`pki-alert-${alert.id}`}>
      <TableCell>{alert.name}</TableCell>
      <TableCell>{alert.alertBeforeDays}</TableCell>
      <TableCell>{pkiCollection ? pkiCollection.name : "-"}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Alert options">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.PkiAlerts}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("pkiAlert", {
                      alertId: alert.id
                    });
                  }}
                  isDisabled={!isAllowed}
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
                  variant="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("deletePkiAlert", {
                      alertId: alert.id,
                      name: alert.name
                    });
                  }}
                  isDisabled={!isAllowed}
                >
                  Delete Alert
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
