import { faBoxesStacked, faEllipsis } from "@fortawesome/free-solid-svg-icons";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useListWorkspacePkiCollections } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiCollection", "deletePkiCollection"]>,
    data?: {}
  ) => void;
};

export const PkiCollectionTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useListWorkspacePkiCollections({
    workspaceId: projectId
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="pki-collections" />}
            {!isLoading &&
              data?.collections.map((pkiCollection) => {
                return (
                  <Tr className="h-10" key={`pki-collection-${pkiCollection.id}`}>
                    <Td>{pkiCollection.name}</Td>
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
                            a={ProjectPermissionSub.PkiCollections}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("pkiCollection", {
                                    collectionId: pkiCollection.id
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                Edit PKI Collection
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.PkiCollections}
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
                                  handlePopUpOpen("deletePkiCollection", {
                                    collectionId: pkiCollection.id,
                                    name: pkiCollection.name
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                Delete PKI Collection
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
        {!isLoading && !data?.collections?.length && (
          <EmptyState title="No collections have been created" icon={faBoxesStacked} />
        )}
      </TableContainer>
    </div>
  );
};
