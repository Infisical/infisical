import { useState } from "react";
import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, CopyIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context";
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

  const { projectId } = useParams({
    strict: false
  });

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
    await revokeToken({
      identityId: parentIdentityId,
      tokenId
    });

    handlePopUpClose("revokeToken");

    createNotification({
      text: `Successfully revoked token ${name ?? ""}`,
      type: "success"
    });
  };

  const revokeTokenData = popUp?.revokeToken?.data as
    | { identityId: string; tokenId: string; name: string }
    | undefined;

  return (
    <div className="col-span-2 mt-3 flex flex-col gap-2">
      <div className="flex items-end justify-between border-b border-border pb-2">
        <span className="text-foreground">Access Tokens</span>
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
              size="xs"
              variant="outline"
              isDisabled={!isAllowed}
              onClick={() => {
                handlePopUpOpen("token", {
                  identityId
                });
              }}
            >
              <PlusIcon />
              Add Token
            </Button>
          )}
        </VariablePermissionCan>
      </div>
      {tokens.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full" isTruncatable>
                  Name
                </TableHead>
                <TableHead>Number of Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.slice((page - 1) * perPage, perPage * page).map((token) => {
                const {
                  createdAt,
                  isAccessTokenRevoked,
                  name,
                  accessTokenTTL,
                  accessTokenNumUsesLimit,
                  accessTokenNumUses,
                  id
                } = token;

                let expiresAt: Date | undefined;
                if (accessTokenTTL > 0) {
                  expiresAt = new Date(new Date(createdAt).getTime() + accessTokenTTL * 1000);
                }

                return (
                  <TableRow key={id}>
                    <TableCell isTruncatable>{name || "—"}</TableCell>
                    <TableCell>
                      {`${accessTokenNumUses}${accessTokenNumUsesLimit ? `/${accessTokenNumUsesLimit}` : ""}`}
                    </TableCell>
                    <TableCell>
                      {/* eslint-disable-next-line no-nested-ternary */}
                      {isAccessTokenRevoked
                        ? "Revoked"
                        : expiresAt
                          ? format(expiresAt, "yyyy-MM-dd")
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="Token actions">
                            <EllipsisIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(id);
                              createNotification({
                                text: "Copied token ID to clipboard",
                                type: "success"
                              });
                            }}
                          >
                            <CopyIcon />
                            Copy Token ID
                          </DropdownMenuItem>
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
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => {
                                  handlePopUpOpen("token", {
                                    identityId,
                                    tokenId: id,
                                    name
                                  });
                                }}
                              >
                                <PencilIcon />
                                Edit Token
                              </DropdownMenuItem>
                            )}
                          </VariablePermissionCan>
                          {!isAccessTokenRevoked && (
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
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!isAllowed}
                                  onClick={() => {
                                    handlePopUpOpen("revokeToken", {
                                      identityId,
                                      tokenId: id,
                                      name
                                    });
                                  }}
                                >
                                  <BanIcon />
                                  Revoke Token
                                </DropdownMenuItem>
                              )}
                            </VariablePermissionCan>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            count={tokens.length}
            page={page}
            perPage={perPage}
            perPageList={[5]}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No access tokens have been generated</EmptyTitle>
            <EmptyDescription>Create an access token to get started</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <AlertDialog
        open={popUp.revokeToken.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("revokeToken", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Revoke {revokeTokenData?.name ? `“${revokeTokenData.name}”` : "token"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The token will no longer be usable. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                if (revokeTokenData) onRevokeTokenSubmit(revokeTokenData);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <IdentityTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
