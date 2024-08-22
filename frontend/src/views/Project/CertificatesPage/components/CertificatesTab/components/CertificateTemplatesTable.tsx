import { faEllipsis, faFileAlt, faTrash } from "@fortawesome/free-solid-svg-icons";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useListWorkspaceCertificateTemplates } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["certificateTemplate", "deleteCertificateTemplate"]>,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

export const CertificateTemplatesTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceCertificateTemplates({
    workspaceId: currentWorkspace?.id ?? ""
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Certificate Authority</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="project-cas" />}
            {!isLoading &&
              data?.certificateTemplates.map((certificateTemplate) => {
                return (
                  <Tr className="h-10" key={`certificate-${certificateTemplate.id}`}>
                    <Td>{certificateTemplate.name}</Td>
                    <Td>{certificateTemplate.caName}</Td>
                    <Td className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <DropdownMenuItem
                            onClick={() =>
                              handlePopUpOpen("certificateTemplate", {
                                id: certificateTemplate.id
                              })
                            }
                            icon={<FontAwesomeIcon icon={faFileAlt} />}
                          >
                            Manage Policies
                          </DropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.CertificateTemplates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                                onClick={() =>
                                  handlePopUpOpen("deleteCertificateTemplate", {
                                    id: certificateTemplate.id,
                                    name: certificateTemplate.name
                                  })
                                }
                              >
                                Delete Template
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
        {!isLoading && !data?.certificateTemplates?.length && (
          <EmptyState title="No certificate templates have been created" icon={faFileAlt} />
        )}
      </TableContainer>
    </div>
  );
};
