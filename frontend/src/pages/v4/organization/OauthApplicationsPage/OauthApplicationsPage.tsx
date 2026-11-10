import { useState } from "react";
import { Navigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { PencilIcon, RefreshCwIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { CopyButton } from "@app/components/v4/ui/sensitive-editor";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { OauthGrantType, type TOauthClient } from "@app/hooks/api/oauthClients/types";

import { useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
import { OauthClientSecretDialog, type TOauthClientSecretData } from "./OauthClientSecretDialog";
import { OauthClientSheet } from "./OauthClientSheet";

const flowLabel = (client: TOauthClient) =>
  [
    client.grantTypes.includes(OauthGrantType.AuthorizationCode) && "Authorization code",
    client.grantTypes.includes(OauthGrantType.TokenExchange) && "Token exchange"
  ]
    .filter(Boolean)
    .join(", ");

const OauthClientsList = ({
  orgId,
  onEdit,
  onSecret
}: {
  orgId: string;
  onEdit: (client: TOauthClient) => void;
  onSecret: (data: TOauthClientSecretData) => void;
}) => {
  const sso = useV4Adapter("sso");
  const { permission } = useOrgPermission();
  const { data: oauthClients = [], isPending } = sso.useOauthClients(orgId);
  const deleteOauthClient = sso.useDeleteOauthClient();
  const rotateOauthClientSecret = sso.useRotateOauthClientSecret();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<TOauthClient>();
  const [rotating, setRotating] = useState<TOauthClient>();
  const [pending, setPending] = useState(false);

  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.OauthClients);
  const canDelete = permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.OauthClients);

  const rows = oauthClients.filter(({ name }) => name.toLowerCase().includes(search.toLowerCase()));

  const onDeleteClient = async () => {
    if (!deleting) return;
    setPending(true);
    try {
      await deleteOauthClient.mutateAsync({ clientDbId: deleting.id });
      saved("Successfully deleted OAuth application");
      setDeleting(undefined);
    } catch (error) {
      failed("Failed to delete OAuth application", error);
    } finally {
      setPending(false);
    }
  };

  const onRotateSecret = async () => {
    if (!rotating) return;
    setPending(true);
    try {
      const { client, clientSecret } = await rotateOauthClientSecret.mutateAsync({
        clientDbId: rotating.id
      });
      setRotating(undefined);
      onSecret({ clientName: client.name, clientId: client.clientId, clientSecret });
      saved("Successfully rotated client secret");
    } catch (error) {
      failed("Failed to rotate client secret", error);
    } finally {
      setPending(false);
    }
  };

  const columns: DataTableColumn<TOauthClient>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (client) => client.name,
      render: (client) => client.name
    },
    {
      id: "clientId",
      header: "Client ID",
      mono: true,
      grow: true,
      text: (client) => client.clientId,
      render: (client) => (
        <Inline gap={4} wrap={false}>
          <span>{client.clientId}</span>
          <CopyButton value={client.clientId} label="Copy client ID" iconOnly />
        </Inline>
      )
    },
    {
      id: "flow",
      header: "Flow",
      render: flowLabel
    },
    {
      id: "pkce",
      header: "PKCE",
      render: (client) => {
        if (!client.grantTypes.includes(OauthGrantType.AuthorizationCode))
          return <Muted>Not applicable</Muted>;
        return client.requirePkce ? "Required" : "Optional";
      }
    },
    {
      id: "created",
      header: "Created",
      width: 140,
      render: (client) => format(new Date(client.createdAt), "MMM d, yyyy")
    }
  ];

  const rowActions: DataTableRowActions<TOauthClient> = {
    inline: [
      {
        label: "Edit",
        icon: PencilIcon,
        disabledReason: () => (canEdit ? undefined : RESTRICTED),
        onSelect: onEdit
      }
    ],
    renderMenu: (client) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => setRotating(client)}
        >
          <Icon icon={RefreshCwIcon} />
          Rotate secret
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setDeleting(client)}
        >
          <Icon name="trash" />
          Delete
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="OAuth application filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search applications"
            placeholder="Search applications"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />
      <DataTable
        label="OAuth applications"
        rows={rows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(client) => client.id}
        rowLabel={(client) => client.name}
        loading={isPending}
        loadingRows={3}
        empty={
          oauthClients.length ? (
            <EmptyState size="sm" icon="search" title="No OAuth applications match search" />
          ) : (
            <EmptyState
              size="sm"
              icon="key"
              title="No OAuth applications found"
              description="Add an application to let an external platform access Infisical on a user's behalf via OAuth 2.0."
            />
          )
        }
      />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !pending && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.name ?? ""} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${deleting?.name ?? ""}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              External platforms using this application will no longer be able to access Infisical
              on a user&apos;s behalf, and existing tokens will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                onDeleteClient();
              }}
            >
              Delete application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(rotating)}
        onOpenChange={(open) => !open && !pending && setRotating(undefined)}
      >
        <AlertDialogContent tone="danger" icon="sync" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Rotate secret for "${rotating?.name ?? ""}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The current client secret stops working immediately. You will need to update the
              external platform with the new secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                onRotateSecret();
              }}
            >
              Rotate secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};

export const OauthApplicationsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/oauth-applications" });
  const { organization } = useV4Session();
  const { permission, isPending: isPermissionPending } = useOrgPermission();
  const [sheet, setSheet] = useState<{ open: boolean; client?: TOauthClient }>({ open: false });
  const [secret, setSecret] = useState<TOauthClientSecretData>();

  if (organization.isSubOrganization) {
    return <Navigate to={v4Path("/organizations/$orgId/settings")} params={{ orgId }} replace />;
  }

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.OauthClients);
  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.OauthClients);

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="OAuth applications"
          description="Let external platforms access Infisical on behalf of your members."
          actions={
            <Button
              variant="accent"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setSheet({ open: true })}
            >
              Add application
            </Button>
          }
        />
        {isPermissionPending || canRead ? (
          <OauthClientsList
            orgId={orgId}
            onEdit={(client) => setSheet({ open: true, client })}
            onSecret={setSecret}
          />
        ) : (
          <AccessRestricted requirement="Read OAuth applications" />
        )}
      </Stack>
      <OauthClientSheet
        open={sheet.open}
        client={sheet.client}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        onCreated={(client, clientSecret) =>
          setSecret({ clientName: client.name, clientId: client.clientId, clientSecret })
        }
      />
      <OauthClientSecretDialog data={secret} onClose={() => setSecret(undefined)} />
    </TooltipProvider>
  );
};
