import { faEllipsis, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub , useWorkspace } from "@app/context";
import { useListWorkspaceAlerts } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["alert", "deleteAlert"]>, data?: {}) => void;
};

export const AlertsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useListWorkspaceAlerts({
    workspaceId: projectId
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Valid Until</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={4} innerKey="project-alerts" />}
            {!isLoading &&
              data?.alerts.map((alert) => {
                return (
                  <Tr className="h-10" key={`alert-${alert.id}`}>
                    <Td>{alert.name}</Td>
                    <Td>Test 2</Td>
                    <Td>Test 3</Td>
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
                            a={ProjectPermissionSub.Alerts}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("alert", {
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
                            a={ProjectPermissionSub.Alerts}
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
                                  handlePopUpOpen("deleteAlert", {
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
              })}
          </TBody>
        </Table>
        {!isLoading && !data?.alerts?.length && (
          <EmptyState title="No alerts have been created" icon={faExclamationCircle} />
        )}
      </TableContainer>
    </div>
  );
};
