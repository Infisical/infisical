import { faEllipsis, faFileAlt, faTrash, faUserPlus } from "@fortawesome/free-solid-svg-icons";
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
  ProjectPermissionActions,
  ProjectPermissionSub,
  useSubscription,
} from "@app/context";
import { 
  // useListWorkspaceCertificateTemplates, 
  useGetCaCertTemplates 
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["certificateTemplate", "deleteCertificateTemplate", "enrollmentOptions", "upgradePlan"]
    >,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

export const CertificateTemplatesTable = ({ handlePopUpOpen, caId }: Props) => {
  const { subscription } = useSubscription();
  
  const { data, isLoading } = useGetCaCertTemplates(caId);

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
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
                    <Td className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="sm" icon={faEllipsis} />
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
                            icon={<FontAwesomeIcon icon={faFileAlt} size="sm" className="mr-1" />}
                          >
                            Manage Policies
                          </DropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.CertificateTemplates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (!subscription?.pkiEst) {
                                    handlePopUpOpen("upgradePlan");
                                    return;
                                  }

                                  handlePopUpOpen("enrollmentOptions", {
                                    id: certificateTemplate.id
                                  });
                                }}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faUserPlus} size="sm" />}
                              >
                                Manage Enrollment
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
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
                                icon={<FontAwesomeIcon icon={faTrash} size="sm" className="mr-1" />}
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
          <EmptyState title="No certificate templates have been created for this CA" icon={faFileAlt} />
        )}
      </TableContainer>
    </div>
  );
};
