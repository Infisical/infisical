import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip, TooltipText } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { UnlinkIcon } from "lucide-react";

import {
  displayHostPattern,
  hostPatternOf,
  SERVICE_TYPE_LABELS
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultBundleRef, TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { targetOf } from "./agent-vault-utils";
import { OAuthStatusBadge } from "./service-oauth";
import { DateCell, ServiceIcon } from "./shared";

import css from "./resources.module.css";

const detailRoute = v4Path(
  "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
);
const HOSTS_SHOWN = 2;
const BUNDLES_SHOWN = 2;

export type TListedService = TAgentVaultService & {
  accessBundles?: TAgentVaultBundleRef[];
};

const Overflow = ({ shown, hidden }: { shown: ReactNode; hidden: string[] }) => (
  <Inline gap={4} align="center" wrap={false}>
    {shown}
    {hidden.length > 0 && (
      <Tooltip content={hidden.join(", ")}>
        <Meta tabIndex={0}>+{hidden.length}</Meta>
      </Tooltip>
    )}
  </Inline>
);

const Target = ({ service }: { service: TAgentVaultService }) => {
  if (service.type === AgentVaultServiceType.Http) {
    const hosts = displayHostPattern(service.hostPattern).split(", ");
    const shown = hosts.slice(0, HOSTS_SHOWN).join(", ");
    return (
      <Overflow
        shown={
          <Meta mono title={shown}>
            {shown}
          </Meta>
        }
        hidden={hosts.slice(HOSTS_SHOWN)}
      />
    );
  }
  const target =
    service.type === AgentVaultServiceType.Mcp
      ? service.serverUrl.replace(/^https:\/\//i, "")
      : targetOf(service);
  return (
    <Meta mono title={targetOf(service)}>
      {target}
    </Meta>
  );
};

const SetupBadge = ({
  service,
  onSetUp
}: {
  service: TAgentVaultService;
  onSetUp: (service: TAgentVaultService) => void;
}) => {
  const { personalValues } = service;
  if (!personalValues) return null;
  const isMissingScopes = personalValues.fields.some(
    (field) => field.oauth?.status === AgentVaultOauthStatus.NeedsAdditionalScopes
  );
  const needsAttention = !personalValues.isConfigured || isMissingScopes;
  let label = "Configured";
  if (!personalValues.isConfigured) label = "Requires setup";
  else if (isMissingScopes) label = "Missing scopes";
  return (
    <Badge
      tone={needsAttention ? "warn" : "soft"}
      icon={needsAttention ? "alert" : "check-c"}
      asChild
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSetUp(service);
        }}
      >
        {label}
      </button>
    </Badge>
  );
};

const OAuthAttention = ({ service }: { service: TAgentVaultService }) => {
  const { credential } = service;
  if (
    credential.type !== AgentVaultCredentialType.OAuth ||
    !credential.status ||
    credential.status === AgentVaultOauthStatus.Connected
  )
    return null;
  if (!credential.variable) return <OAuthStatusBadge status={credential.status} />;
  return (
    <TooltipText
      content={`Uses the ${credential.variable.key} variable. Authorize it on the Variables page.`}
    >
      <OAuthStatusBadge status={credential.status} />
    </TooltipText>
  );
};

export const ServicesTable = ({
  orgId,
  projectId,
  accessBundleId,
  services,
  canManage,
  loading,
  sort,
  onSortChange,
  empty,
  filtered,
  pagination,
  onEdit,
  onSetUp
}: {
  orgId: string;
  projectId: string;
  accessBundleId?: string;
  services: readonly TListedService[];
  canManage: boolean;
  loading: boolean;
  sort: { columnId: string; direction: "asc" | "desc" };
  onSortChange: (sort: { columnId: string; direction: "asc" | "desc" }) => void;
  empty: ReactNode;
  filtered?: boolean;
  pagination?: ReactNode;
  onEdit: (service: TAgentVaultService) => void;
  onSetUp: (service: TAgentVaultService) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const deleteService = resources.useDeleteService(projectId);
  const removeService = resources.useRemoveAccessBundleService(projectId);
  const [removing, setRemoving] = useState<TListedService>();
  const isBundle = Boolean(accessBundleId);

  const columns: DataTableColumn<TListedService>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      minWidth: 240,
      text: (service) => service.name,
      render: (service) => (
        <Inline gap={8} align="center" wrap={false}>
          <ServiceIcon hostPattern={hostPatternOf(service)} serviceType={service.type} />
          <span title={service.name} className={css.name}>
            {service.name}
          </span>
          <OAuthAttention service={service} />
          {service.description && (
            <Meta mono={false} title={service.description} className={css.description}>
              {service.description}
            </Meta>
          )}
        </Inline>
      )
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      width: 112,
      render: (service) => <span>{SERVICE_TYPE_LABELS[service.type]}</span>
    },
    {
      id: "target",
      header: "Target",
      sortable: isBundle,
      width: 240,
      render: (service) => <Target service={service} />
    },
    ...(isBundle
      ? []
      : [
          {
            id: "accessBundles",
            header: "Access bundles",
            width: 200,
            render: (service: TListedService) => {
              const bundles = service.accessBundles ?? [];
              if (!bundles.length) return null;
              return (
                <Overflow
                  shown={bundles.slice(0, BUNDLES_SHOWN).map((bundle) => (
                    <Badge key={bundle.id} tone="outline" asChild>
                      <Link
                        to={detailRoute}
                        params={{ orgId, projectId, accessBundleId: bundle.id }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {bundle.name}
                      </Link>
                    </Badge>
                  ))}
                  hidden={bundles.slice(BUNDLES_SHOWN).map((bundle) => bundle.name)}
                />
              );
            }
          } satisfies DataTableColumn<TListedService>
        ]),
    {
      id: "createdAt",
      header: "Created",
      sortable: true,
      width: 128,
      render: (service) => <DateCell value={service.createdAt} />
    },
    {
      id: "setup",
      header: "Personal values",
      hideHeader: true,
      width: 144,
      render: (service) => <SetupBadge service={service} onSetUp={onSetUp} />
    }
  ];

  const rowActions: DataTableRowActions<TListedService> = {
    menuLabel: "Service options",
    inline: canManage
      ? [
          {
            label: "Edit service",
            icon: "pencil",
            onSelect: onEdit
          }
        ]
      : undefined,
    menuDisabledReason: (service) =>
      canManage || service.personalValues ? undefined : "Only admins can change services",
    renderMenu: (service) => (
      <>
        {service.personalValues && (
          <DropdownMenuItem onSelect={() => onSetUp(service)}>
            <Icon name="key" />
            {service.personalValues.isConfigured
              ? "Update my personal values"
              : "Set up my personal values"}
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            {service.personalValues && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(service)}>
              {isBundle ? <Icon icon={UnlinkIcon} /> : <Icon name="trash" />}
              {isBundle ? "Remove from bundle" : "Delete service"}
            </DropdownMenuItem>
          </>
        )}
      </>
    )
  };

  return (
    <>
      <DataTable
        filtered={filtered}
        label="Services"
        rows={services}
        columns={columns}
        loading={loading}
        getRowId={(service) => service.id}
        rowLabel={(service) => service.name}
        rowActions={rowActions}
        sort={sort}
        onSortChange={onSortChange}
        empty={empty}
        pagination={pagination}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing?.name}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBundle
                ? `Remove ${removing?.name ?? ""} from this bundle?`
                : `Delete ${removing?.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBundle
                ? "Sessions on this bundle lose the service at the next proxy poll. It stays in the project, and members who can't reach it through another bundle lose their personal values for it."
                : "It leaves every access bundle it's in, agents lose the credential at the next proxy poll, and members' personal values for it are deleted. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!removing) return;
                try {
                  if (accessBundleId) {
                    await removeService.mutateAsync({
                      accessBundleId,
                      serviceId: removing.id
                    });
                    saved(`Service ${removing.name} removed from this bundle`);
                  } else {
                    await deleteService.mutateAsync({ serviceId: removing.id });
                    saved(`Service ${removing.name} deleted`);
                  }
                } catch (error) {
                  failed(`Failed to ${isBundle ? "remove" : "delete"} service`, error);
                }
                setRemoving(undefined);
              }}
            >
              {isBundle ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
