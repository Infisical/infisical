import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";

import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

import { ProviderLabel } from "../../components/provider-label";
import {
  ACTIVE_LOCKOUTS,
  AUTH_METHOD_ORDER,
  type AuthGates,
  AuthMethodFormSheet,
  AuthMethodViewSheet,
  RemoveAuthMethodDialog,
  sortedMethods
} from "../identity-auth/sheets";
import { useProjectPermission } from "../permissions";
import { Gate, RESTRICTED } from "../ui";
import { type AuthIdentity, authMethodName, identitySubject, LockedBadge } from "./identity-common";

const useAuthGates = (projectId: string, identityId?: string): AuthGates => {
  const { permission } = useProjectPermission(projectId);
  const target = identitySubject(identityId ?? "");
  return {
    canEditAuth: permission.can(ProjectPermissionIdentityActions.EditAuth, target),
    canRevokeAuth: permission.can(ProjectPermissionIdentityActions.RevokeAuth, target),
    canCreateToken: permission.can(ProjectPermissionIdentityActions.CreateToken, target),
    canDeleteToken: permission.can(ProjectPermissionIdentityActions.DeleteToken, target),
    canEdit: permission.can(ProjectPermissionIdentityActions.Edit, target)
  };
};

export const useAuthMethodFlows = (projectId: string, identity?: AuthIdentity) => {
  const gates = useAuthGates(projectId, identity?.id);
  const [viewing, setViewing] = useState<IdentityAuthMethod>();
  const [form, setForm] = useState<{ method?: IdentityAuthMethod; key: number }>();
  const [removing, setRemoving] = useState<IdentityAuthMethod>();
  const scope = { projectId };
  return {
    view: setViewing,
    add: () => setForm({ key: Date.now() }),
    edit: (method: IdentityAuthMethod) => setForm({ method, key: Date.now() }),
    remove: setRemoving,
    overlays: identity && (
      <>
        <AuthMethodViewSheet
          identity={identity}
          method={viewing}
          open={Boolean(viewing)}
          gates={gates}
          onOpenChange={(open) => !open && setViewing(undefined)}
          onEdit={() => {
            setForm({ method: viewing, key: Date.now() });
            setViewing(undefined);
          }}
          onRemove={() => {
            setRemoving(viewing);
            setViewing(undefined);
          }}
        />
        <AuthMethodFormSheet
          key={form?.key}
          identity={identity}
          scope={scope}
          method={form?.method}
          open={Boolean(form)}
          onOpenChange={(open) => !open && setForm(undefined)}
        />
        <RemoveAuthMethodDialog
          identity={identity}
          scope={scope}
          method={removing}
          onClose={() => setRemoving(undefined)}
        />
      </>
    )
  };
};

export const ProjectIdentityAuthSection = ({
  identity,
  projectId
}: {
  identity: AuthIdentity;
  projectId: string;
}) => {
  const { canEditAuth, canRevokeAuth } = useAuthGates(projectId, identity.id);
  const flows = useAuthMethodFlows(projectId, identity);
  const methods = sortedMethods(identity.authMethods);
  const addButton = (
    <Gate allowed={canEditAuth}>
      <Button variant="accent" icon="plus" disabled={!canEditAuth} onClick={flows.add}>
        Add auth method
      </Button>
    </Gate>
  );
  const columns: DataTableColumn<IdentityAuthMethod>[] = [
    {
      id: "method",
      header: "Auth method",
      render: (method) => (
        <Inline gap={8} wrap={false}>
          <ProviderLabel kind="identity-auth" value={method} />
          {identity.activeLockoutAuthMethods?.includes(method) && (
            <LockedBadge label={ACTIVE_LOCKOUTS} />
          )}
        </Inline>
      )
    }
  ];

  const rowActions: DataTableRowActions<IdentityAuthMethod> = {
    inline: [
      {
        label: "Edit auth method",
        icon: "settings",
        disabledReason: () => (canEditAuth ? undefined : RESTRICTED),
        onSelect: flows.edit
      }
    ],
    renderMenu: (method) => (
      <>
        <DropdownMenuItem onSelect={() => flows.view(method)}>
          <Icon name="eye" />
          View auth method
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canRevokeAuth}
          description={canRevokeAuth ? undefined : RESTRICTED}
          onSelect={() => flows.remove(method)}
        >
          <Icon name="trash" />
          Remove auth method
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <>
      <Card
        variant="framed"
        title="Authentication"
        action={methods.length < AUTH_METHOD_ORDER.length ? addButton : undefined}
      >
        {methods.length > 0 ? (
          <DataTable
            label="Auth methods"
            rows={methods}
            columns={columns}
            rowActions={rowActions}
            getRowId={(method) => method}
            rowLabel={authMethodName}
            onRowActivate={flows.view}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="key"
            title="This machine identity has no auth methods configured"
          />
        )}
      </Card>
      {flows.overlays}
    </>
  );
};
