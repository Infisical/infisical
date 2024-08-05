import { faCertificate, faEllipsis } from "@fortawesome/free-solid-svg-icons";
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
  Tr} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useGetCaCerts } from "@app/hooks/api";

type Props = {
  caId: string;
};

// TODO: not before

// created at
// expires on

export const CaCertificatesTable = ({ caId }: Props) => {
  const { data: caCerts, isLoading } = useGetCaCerts(caId);
  console.log("CaCertificatesTable data: ", caCerts);
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Created At</Th>
            <Th>Valid Until</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="ca-certificates" />}
          {!isLoading &&
            caCerts?.map((caCert) => {
              //   console.log("caCert index: ", index);
              //   const isLastItem = index === caCerts.length - 1;
              return (
                <Tr key={`ca-cert=${caCert.serialNumber}`}>
                  <Td>
                    <div className="flex items-center">
                      Certificate {caCert.version}
                      {/* <Badge variant="success" className="ml-4">
                        Current
                      </Badge> */}
                    </div>
                  </Td>
                  <Td>Test</Td>
                  <Td>Test</Td>
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
                          a={ProjectPermissionSub.Identity}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO
                                // router.push(`/org/${orgId}/identities/${id}`);
                              }}
                              disabled={!isAllowed}
                            >
                              Download CA Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Identity}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO
                                // handlePopUpOpen("deleteIdentity", {
                                //   identityId: id,
                                //   name
                                // });
                              }}
                              disabled={!isAllowed}
                            >
                              Download CA Certificate Chain
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
      {!isLoading && !caCerts?.length && (
        <EmptyState
          title="This CA does not have any CA certificates installed"
          icon={faCertificate}
        />
      )}
    </TableContainer>
  );
};
