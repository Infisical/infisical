import { useState } from "react";
import { subject } from "@casl/ability";
import { faKey, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useRevokeIdentityUniversalAuthClientSecret } from "@app/hooks/api";
import { ClientSecretData } from "@app/hooks/api/identities/types";
import { IdentityClientSecretModal } from "@app/pages/organization/IdentityDetailsByIDPage/components";

type Props = {
  clientSecrets: ClientSecretData[];
  identityId: string;
};

export const IdentityUniversalAuthClientSecretsTable = ({ clientSecrets, identityId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "revokeClientSecret",
    "clientSecret"
  ] as const);

  const { projectId } = useParams({
    strict: false
  });

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const { mutateAsync: revokeClientSecret } = useRevokeIdentityUniversalAuthClientSecret();

  const onDeleteClientSecretSubmit = async (clientSecretId: string) => {
    await revokeClientSecret({
      identityId,
      clientSecretId
    });

    handlePopUpToggle("revokeClientSecret", false);

    createNotification({
      text: "Successfully deleted client secret",
      type: "success"
    });
  };

  return (
    <div className="col-span-2">
      <div className="flex items-end justify-between border-b border-mineshaft-500 pb-2">
        <span className="text-bunker-300">Client Secrets</span>
        <VariablePermissionCan
          type={projectId ? "project" : "org"}
          I={projectId ? ProjectPermissionIdentityActions.Edit : OrgPermissionIdentityActions.Edit}
          a={
            projectId
              ? subject(ProjectPermissionSub.Identity, {
                  identityId
                })
              : OrgPermissionSubjects.Identity
          }
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              size="xs"
              onClick={() => {
                handlePopUpOpen("clientSecret", {
                  identityId
                });
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              colorSchema="secondary"
            >
              Add Client Secret
            </Button>
          )}
        </VariablePermissionCan>
      </div>
      <TableContainer className="mt-4 rounded-none border-none">
        <Table>
          {Boolean(clientSecrets?.length) && (
            <THead>
              <Tr className="text-xs font-medium">
                <Th className="py-1 font-normal">Secret</Th>
                <Th className="py-1 font-normal">Description</Th>
                <Th className="py-1 font-normal whitespace-nowrap">Number of Uses</Th>
                <Th className="py-1 font-normal">Expires</Th>
                <Th className="w-5 py-1 font-normal" />
              </Tr>
            </THead>
          )}
          <TBody>
            {clientSecrets
              .slice((page - 1) * perPage, perPage * page)
              .map(
                ({
                  createdAt,
                  clientSecretTTL,
                  description,
                  clientSecretNumUses,
                  clientSecretPrefix,
                  clientSecretNumUsesLimit,
                  id
                }) => {
                  let expiresAt;
                  if (clientSecretTTL > 0) {
                    expiresAt = new Date(new Date(createdAt).getTime() + clientSecretTTL * 1000);
                  }

                  return (
                    <Tr className="text-xs hover:bg-mineshaft-700" key={id}>
                      <Td>{clientSecretPrefix}***</Td>
                      <Td>{description || "-"}</Td>
                      <Td>
                        {`${clientSecretNumUses}${clientSecretNumUsesLimit ? `/${clientSecretNumUsesLimit}` : ""}`}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {expiresAt ? format(expiresAt, "yyyy-MM-dd") : "-"}
                      </Td>
                      <Td>
                        <VariablePermissionCan
                          type={projectId ? "project" : "org"}
                          I={
                            projectId
                              ? ProjectPermissionIdentityActions.Edit
                              : OrgPermissionIdentityActions.Edit
                          }
                          a={
                            projectId
                              ? subject(ProjectPermissionSub.Identity, {
                                  identityId
                                })
                              : OrgPermissionSubjects.Identity
                          }
                        >
                          {(isAllowed) => (
                            <Tooltip content={isAllowed ? "Delete Secret" : "Access Restricted"}>
                              <IconButton
                                isDisabled={!isAllowed}
                                onClick={() => {
                                  handlePopUpOpen("revokeClientSecret", {
                                    clientSecretPrefix,
                                    clientSecretId: id
                                  });
                                }}
                                size="xs"
                                colorSchema="danger"
                                variant="plain"
                                ariaLabel="Delete secret"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </VariablePermissionCan>
                      </Td>
                    </Tr>
                  );
                }
              )}
          </TBody>
        </Table>
        {!clientSecrets?.length && (
          <EmptyState iconSize="1x" title="No client secrets have been generated" icon={faKey} />
        )}
        {clientSecrets.length > 0 && (
          <Pagination
            count={clientSecrets.length}
            page={page}
            perPage={perPage}
            perPageList={[5]}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.revokeClientSecret.isOpen}
        title={`Are you sure you want to delete the client secret ${
          (popUp?.revokeClientSecret?.data as { clientSecretPrefix: string })?.clientSecretPrefix ||
          ""
        }************?`}
        onChange={(isOpen) => handlePopUpToggle("revokeClientSecret", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const deleteClientSecretData = popUp?.revokeClientSecret?.data as {
            clientSecretId: string;
            clientSecretPrefix: string;
          };

          return onDeleteClientSecretSubmit(deleteClientSecretData.clientSecretId);
        }}
      />
      <IdentityClientSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
