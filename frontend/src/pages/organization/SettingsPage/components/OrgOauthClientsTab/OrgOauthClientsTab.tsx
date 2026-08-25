import { useState } from "react";
import { format } from "date-fns";
import { KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan, PermissionDeniedBanner } from "@app/components/permissions";
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  OauthGrantType,
  TOauthClient,
  useDeleteOauthClient,
  useGetOauthClients,
  useRotateOauthClientSecret
} from "@app/hooks/api";

import { OauthClientModal } from "./OauthClientModal";
import { OauthClientSecretModal } from "./OauthClientSecretModal";

export const OrgOauthClientsTab = () => {
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { data: oauthClients, isPending } = useGetOauthClients(currentOrg?.id ?? "");
  const [search, setSearch] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "clientForm",
    "clientSecret",
    "deleteClient",
    "rotateSecret"
  ] as const);

  const { mutateAsync: deleteOauthClient } = useDeleteOauthClient();
  const { mutateAsync: rotateOauthClientSecret } = useRotateOauthClientSecret();

  const clientPendingDeletion = popUp?.deleteClient?.data as TOauthClient | undefined;

  const onDeleteClient = async () => {
    if (!clientPendingDeletion) return;

    try {
      await deleteOauthClient({ clientDbId: clientPendingDeletion.id });
      createNotification({
        text: "Successfully deleted OAuth application",
        type: "success"
      });
      handlePopUpClose("deleteClient");
    } catch {
      // Reported by the mutation cache's global onError; caught here only to keep the dialog open.
    }
  };

  const onRotateSecret = async () => {
    const client = popUp?.rotateSecret?.data as TOauthClient | undefined;
    if (!client) return;

    try {
      const { client: updatedClient, clientSecret } = await rotateOauthClientSecret({
        clientDbId: client.id
      });
      handlePopUpClose("rotateSecret");
      handlePopUpOpen("clientSecret", {
        clientName: updatedClient.name,
        clientId: updatedClient.clientId,
        clientSecret
      });
      createNotification({
        text: "Successfully rotated client secret",
        type: "success"
      });
    } catch {
      // Reported by the mutation cache's global onError; caught here only to keep the dialog open.
    }
  };

  const filteredClients = (oauthClients ?? []).filter(({ name }) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.OauthClients);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <KeyRound className="size-4 text-accent" />
            OAuth Applications
          </CardTitle>
          <CardDescription>
            Register external platforms to request delegated access to Infisical on a user&apos;s
            behalf via OAuth 2.0, limited to that user&apos;s permissions.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.OauthClients}
            >
              {(isAllowed) => (
                <Button
                  variant="outline"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("clientForm")}
                >
                  <Plus />
                  Add Application
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!canRead ? (
            <PermissionDeniedBanner />
          ) : (
            <div className="flex flex-col gap-4">
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search applications"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              {!isPending && filteredClients.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No OAuth applications found</EmptyTitle>
                    <EmptyDescription>
                      Add an application to let an external platform access Infisical on a
                      user&apos;s behalf via OAuth 2.0.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Client ID</TableHead>
                      <TableHead>Flow</TableHead>
                      <TableHead>PKCE</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-px text-right" aria-label="Actions" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending &&
                      Array.from({ length: 3 }).map((_, idx) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <TableRow key={`oauth-client-skeleton-${idx}`}>
                          <TableCell colSpan={6}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {filteredClients.map((client) => {
                      const usesAuthorizationCode = client.grantTypes.includes(
                        OauthGrantType.AuthorizationCode
                      );
                      const usesTokenExchange = client.grantTypes.includes(
                        OauthGrantType.TokenExchange
                      );

                      return (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium text-foreground">
                            {client.name}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs">{client.clientId}</span>
                              <CopyButton value={client.clientId} ariaLabel="Copy client ID" />
                            </div>
                          </TableCell>
                          <TableCell>
                            {[
                              usesAuthorizationCode && "Authorization code",
                              usesTokenExchange && "Token exchange"
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </TableCell>
                          <TableCell>
                            {!usesAuthorizationCode && (
                              <span className="text-muted">Not applicable</span>
                            )}
                            {usesAuthorizationCode &&
                              (client.requirePkce ? "Required" : "Optional")}
                          </TableCell>
                          <TableCell>{format(new Date(client.createdAt), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="xs"
                                  aria-label={`Actions for ${client.name}`}
                                >
                                  <MoreHorizontal />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.OauthClients}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() => handlePopUpOpen("clientForm", client)}
                                    >
                                      <Pencil />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.OauthClients}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() => handlePopUpOpen("rotateSecret", client)}
                                    >
                                      <RefreshCw />
                                      Rotate Secret
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Delete}
                                  a={OrgPermissionSubjects.OauthClients}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      variant="danger"
                                      isDisabled={!isAllowed}
                                      onClick={() => handlePopUpOpen("deleteClient", client)}
                                    >
                                      <Trash2 />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <OauthClientModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        onCreated={(client, clientSecret) =>
          handlePopUpOpen("clientSecret", {
            clientName: client.name,
            clientId: client.clientId,
            clientSecret
          })
        }
      />
      <OauthClientSecretModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteConfirmDialog
        isOpen={popUp.deleteClient.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteClient", isOpen)}
        title={`Delete "${clientPendingDeletion?.name ?? ""}"?`}
        description="External platforms using this application will no longer be able to access Infisical on a user's behalf, and existing tokens will be revoked."
        confirmKey={clientPendingDeletion?.name ?? ""}
        confirmLabel="Delete Application"
        onConfirm={onDeleteClient}
      />
      <AlertDialog
        open={popUp.rotateSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("rotateSecret", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RefreshCw />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Rotate secret for &quot;
              {(popUp?.rotateSecret?.data as TOauthClient | undefined)?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The current client secret stops working immediately. You will need to update the
              external platform with the new secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onRotateSecret}>
              Rotate Secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
