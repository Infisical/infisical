import { faEllipsis, faFileAlt, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useGetSshCaCertTemplates } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  sshCaId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["sshCertificateTemplate", "deleteSshCertificateTemplate", "upgradePlan"]
    >,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

export const SshCertificateTemplatesTable = ({ handlePopUpOpen, sshCaId }: Props) => {
  const { data, isLoading } = useGetSshCaCertTemplates(sshCaId);

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
                              handlePopUpOpen("sshCertificateTemplate", {
                                id: certificateTemplate.id
                              })
                            }
                            icon={<FontAwesomeIcon icon={faFileAlt} size="sm" className="mr-1" />}
                          >
                            Edit Template
                          </DropdownMenuItem>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Delete}
                            a={OrgPermissionSubjects.SshCertificateTemplates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} size="sm" className="mr-1" />}
                                onClick={() =>
                                  handlePopUpOpen("deleteSshCertificateTemplate", {
                                    id: certificateTemplate.id,
                                    name: certificateTemplate.name
                                  })
                                }
                              >
                                Delete Template
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && !data?.certificateTemplates?.length && (
          <EmptyState
            title="No certificate templates have been created for this SSH CA"
            icon={faFileAlt}
          />
        )}
      </TableContainer>
    </div>
  );
};
