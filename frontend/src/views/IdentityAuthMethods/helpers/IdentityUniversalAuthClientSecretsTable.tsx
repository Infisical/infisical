import { useState } from "react";
import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { EllipsisIcon, PlusIcon, Trash2Icon } from "lucide-react";

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

  const revokeClientSecretData = popUp?.revokeClientSecret?.data as
    | { clientSecretId: string; clientSecretPrefix: string }
    | undefined;

  return (
    <div className="col-span-2 flex flex-col gap-2">
      <div className="flex items-end justify-between border-b border-border pb-2">
        <span className="text-foreground">Client Secrets</span>
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
                handlePopUpOpen("clientSecret", {
                  identityId
                });
              }}
            >
              <PlusIcon />
              Add Client Secret
            </Button>
          )}
        </VariablePermissionCan>
      </div>
      {clientSecrets.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Secret</TableHead>
                <TableHead className="w-full" isTruncatable>
                  Description
                </TableHead>
                <TableHead>Number of Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientSecrets.slice((page - 1) * perPage, perPage * page).map((secret) => {
                const {
                  createdAt,
                  clientSecretTTL,
                  description,
                  clientSecretNumUses,
                  clientSecretPrefix,
                  clientSecretNumUsesLimit,
                  id
                } = secret;

                let expiresAt: Date | undefined;
                if (clientSecretTTL > 0) {
                  expiresAt = new Date(new Date(createdAt).getTime() + clientSecretTTL * 1000);
                }

                return (
                  <TableRow key={id}>
                    <TableCell>{clientSecretPrefix}***</TableCell>
                    <TableCell isTruncatable>{description || "—"}</TableCell>
                    <TableCell>
                      {`${clientSecretNumUses}${clientSecretNumUsesLimit ? `/${clientSecretNumUsesLimit}` : ""}`}
                    </TableCell>
                    <TableCell>{expiresAt ? format(expiresAt, "yyyy-MM-dd") : "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="Client secret actions">
                            <EllipsisIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                                  handlePopUpOpen("revokeClientSecret", {
                                    clientSecretPrefix,
                                    clientSecretId: id
                                  });
                                }}
                              >
                                <Trash2Icon />
                                Delete Secret
                              </DropdownMenuItem>
                            )}
                          </VariablePermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            count={clientSecrets.length}
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
            <EmptyTitle>No client secrets have been generated</EmptyTitle>
            <EmptyDescription>Generate a client secret to get start</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <AlertDialog
        open={popUp.revokeClientSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("revokeClientSecret", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Delete client secret{" "}
              {revokeClientSecretData?.clientSecretPrefix
                ? `${revokeClientSecretData.clientSecretPrefix}************`
                : ""}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The secret will no longer be usable. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                if (revokeClientSecretData)
                  onDeleteClientSecretSubmit(revokeClientSecretData.clientSecretId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <IdentityClientSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
