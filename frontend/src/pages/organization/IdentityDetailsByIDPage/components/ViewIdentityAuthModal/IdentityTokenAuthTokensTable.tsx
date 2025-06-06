import { useState } from "react";
import { faBan, faEdit, faKey, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useRevokeIdentityTokenAuthToken } from "@app/hooks/api";
import { IdentityAccessToken } from "@app/hooks/api/identities/types";
import { IdentityTokenModal } from "@app/pages/organization/IdentityDetailsByIDPage/components";

type Props = {
  tokens: IdentityAccessToken[];
  identityId: string;
};

export const IdentityTokenAuthTokensTable = ({ tokens, identityId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "token",
    "revokeToken"
  ] as const);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const { mutateAsync: revokeToken } = useRevokeIdentityTokenAuthToken();

  const onRevokeTokenSubmit = async ({
    identityId: parentIdentityId,
    tokenId,
    name
  }: {
    identityId: string;
    tokenId: string;
    name: string;
  }) => {
    try {
      await revokeToken({
        identityId: parentIdentityId,
        tokenId
      });

      handlePopUpClose("revokeToken");

      createNotification({
        text: `Successfully revoked token ${name ?? ""}`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to revoke token";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div className="col-span-2 mt-3">
      <div className="flex items-end justify-between border-b border-mineshaft-500 pb-2">
        <span className="text-bunker-300">Access Tokens</span>
        <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => (
            <Button
              size="xs"
              isDisabled={!isAllowed}
              onClick={() => {
                handlePopUpOpen("token", {
                  identityId
                });
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              colorSchema="secondary"
            >
              Add Token
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <TableContainer className="mt-4 rounded-none border-none">
        <Table>
          {Boolean(tokens?.length) && (
            <THead>
              <Tr className="text-xs font-medium">
                <Th className="py-1 font-normal">Name</Th>
                <Th className="whitespace-nowrap py-1 font-normal">Number of Uses</Th>
                <Th className="py-1 font-normal">Expires</Th>
                <Th className="w-5 py-1 font-normal" />
              </Tr>
            </THead>
          )}
          <TBody>
            {tokens
              .slice((page - 1) * perPage, perPage * page)
              .map(
                ({
                  createdAt,
                  isAccessTokenRevoked,
                  name,
                  accessTokenTTL,
                  accessTokenNumUsesLimit,
                  accessTokenNumUses,
                  id
                }) => {
                  let expiresAt;
                  if (accessTokenTTL > 0) {
                    expiresAt = new Date(new Date(createdAt).getTime() + accessTokenTTL * 1000);
                  }

                  return (
                    <Tr className="text-xs hover:bg-mineshaft-700" key={id}>
                      <Td>{name || "-"}</Td>
                      <Td>
                        {`${accessTokenNumUses}${accessTokenNumUsesLimit ? `/${accessTokenNumUsesLimit}` : ""}`}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {/* eslint-disable-next-line no-nested-ternary */}
                        {isAccessTokenRevoked
                          ? "Revoked"
                          : expiresAt
                            ? format(expiresAt, "yyyy-MM-dd")
                            : "-"}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <Tooltip content={isAllowed ? "Edit Token" : "Access Restricted"}>
                                <IconButton
                                  isDisabled={!isAllowed}
                                  onClick={() => {
                                    handlePopUpOpen("token", {
                                      identityId,
                                      tokenId: id,
                                      name
                                    });
                                  }}
                                  size="xs"
                                  variant="plain"
                                  ariaLabel="Edit token"
                                >
                                  <FontAwesomeIcon icon={faEdit} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </OrgPermissionCan>
                          {!isAccessTokenRevoked && (
                            <OrgPermissionCan
                              I={OrgPermissionIdentityActions.Edit}
                              a={OrgPermissionSubjects.Identity}
                            >
                              {(isAllowed) => (
                                <Tooltip content={isAllowed ? "Revoke Token" : "Access Restricted"}>
                                  <IconButton
                                    isDisabled={!isAllowed}
                                    onClick={() => {
                                      handlePopUpOpen("revokeToken", {
                                        identityId,
                                        tokenId: id,
                                        name
                                      });
                                    }}
                                    size="xs"
                                    colorSchema="danger"
                                    variant="plain"
                                    ariaLabel="Revoke token"
                                  >
                                    <FontAwesomeIcon icon={faBan} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </OrgPermissionCan>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                }
              )}
          </TBody>
        </Table>
        {!tokens?.length && (
          <EmptyState iconSize="1x" title="No access tokens have been generated" icon={faKey} />
        )}
        {tokens.length > 0 && (
          <Pagination
            count={tokens.length}
            page={page}
            perPage={perPage}
            perPageList={[5]}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.revokeToken.isOpen}
        title={`Are you sure you want to revoke ${
          (popUp?.revokeToken?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("revokeToken", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const revokeTokenData = popUp?.revokeToken?.data as {
            identityId: string;
            tokenId: string;
            name: string;
          };

          return onRevokeTokenSubmit(revokeTokenData);
        }}
      />
      <IdentityTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
