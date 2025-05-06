import { faEllipsis, faPencil, faServer, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useWorkspace
} from "@app/context";
import { useListWorkspacePkiSubscribers } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deletePkiSubscriber", "pkiSubscriber"]>,
    data?: object
  ) => void;
};

export const PkiSubscribersTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isPending } = useListWorkspacePkiSubscribers(currentWorkspace?.id || "");
  return (
    <div>
      <TableContainer>
        <Table className="w-full table-fixed">
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Common Name</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="pki-subscribers" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map((subscriber) => {
                return (
                  <Tr className="h-10" key={`pki-subscriber-${subscriber.id}`}>
                    <Td>{subscriber.name}</Td>
                    <Td>{subscriber.commonName}</Td>
                    <Td className="text-right align-middle">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiSubscriberActions.Edit}
                            a={ProjectPermissionSub.PkiSubscribers}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("pkiSubscriber", {
                                    subscriberId: subscriber.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faPencil} />}
                              >
                                Edit Subscriber
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiSubscriberActions.Delete}
                            a={ProjectPermissionSub.PkiSubscribers}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deletePkiSubscriber", {
                                    subscriberId: subscriber.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete Subscriber
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
        {!isPending && data?.length === 0 && (
          <EmptyState title="No PKI subscribers have been added" icon={faServer} />
        )}
      </TableContainer>
    </div>
  );
};
