import { faBoxesStacked, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
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
import { ProjectType } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiCollection", "deletePkiCollection"]>,
    data?: object
  ) => void;
};

export const PkiCollectionTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isPending } = useListWorkspacePkiCollections({
    workspaceId: projectId
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="pki-collections" />}
            {!isPending &&
              data?.collections.map((pkiCollection) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`pki-collection-${pkiCollection.id}`}
                    onClick={() =>
                      navigate({
                        to: `/${ProjectType.CertificateManager}/$projectId/pki-collections/$collectionId` as const,
                        params: {
                          projectId,
                          collectionId: pkiCollection.id
                        }
                      })
                    }
                  >
                    <Td>{pkiCollection.name}</Td>
                    <Td>{pkiCollection.description ? pkiCollection.description : "-"}</Td>
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
                                Edit Collection
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
                                Delete Collection
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
        {!isPending && !data?.collections?.length && (
          <EmptyState title="No certificate collections have been created" icon={faBoxesStacked} />
        )}
      </TableContainer>
    </div>
  );
};
