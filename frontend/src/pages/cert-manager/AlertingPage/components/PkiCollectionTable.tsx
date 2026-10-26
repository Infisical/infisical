import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useListWorkspacePkiCollections } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiCollection", "deletePkiCollection"]>,
    data?: object
  ) => void;
};

export const PkiCollectionTable = ({ handlePopUpOpen }: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data, isPending } = useListWorkspacePkiCollections({
    projectId
  });

  if (!isPending && !data?.collections?.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No certificate collections have been created</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && <TableSkeletonRows columns={3} />}
          {!isPending &&
            data?.collections.map((pkiCollection) => {
              return (
                <TableRow
                  key={`pki-collection-${pkiCollection.id}`}
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/cert-manager/pki-collections/$collectionId",
                      params: {
                        orgId: currentOrg.id,
                        collectionId: pkiCollection.id
                      }
                    })
                  }
                >
                  <TableCell>{pkiCollection.name}</TableCell>
                  <TableCell>
                    {pkiCollection.description ? pkiCollection.description : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="More options">
                          <FontAwesomeIcon icon={faEllipsis} />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.PkiCollections}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("pkiCollection", {
                                  collectionId: pkiCollection.id
                                });
                              }}
                              isDisabled={!isAllowed}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deletePkiCollection", {
                                  collectionId: pkiCollection.id,
                                  name: pkiCollection.name
                                });
                              }}
                              isDisabled={!isAllowed}
                              variant="danger"
                            >
                              Delete Collection
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    </div>
  );
};
