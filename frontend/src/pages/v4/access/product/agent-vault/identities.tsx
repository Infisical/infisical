import { useState } from "react";
import { Trash2Icon, VaultIcon } from "lucide-react";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { accessLinks } from "../../links";
import { useGo } from "../../navigation";
import { useProjectPermission } from "../../permissions";
import { AddProjectIdentitySheet } from "../../project/identity-add-sheet";
import { useProjectScope } from "../../project/scope";
import { failed, saved } from "../../toast";
import { Gate } from "../../ui";
import { ChangeRoleDialog, ProductRoleBadge, useMemberList } from "./shared";

type IdentityMember = TAgentVaultProductMemberOf<AgentVaultMemberType.MachineIdentity>;

const ManagedByBadge = ({ identity }: { identity: IdentityMember }) => {
  const { organization } = useV4Session();
  if (identity.isManagedByAgentVault)
    return (
      <Badge tone="accent">
        <Icon icon={VaultIcon} size={12} />
        Agent Vault
      </Badge>
    );
  return (
    <Badge tone="outline">
      <Icon name="building" size={12} />
      {organization.isSubOrganization && organization.id === identity.orgId
        ? "Sub-organization"
        : "Organization"}
    </Badge>
  );
};

export const AgentVaultIdentitiesTab = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const av = useV4Adapter("agentVault");
  const { permission } = useProjectPermission(projectId);
  const revoke = av.useRevokeMembers(projectId);
  const deleteManaged = av.useDeleteManagedIdentity(projectId);
  const list = useMemberList(projectId, AgentVaultMemberType.MachineIdentity);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IdentityMember>();
  const [removing, setRemoving] = useState<IdentityMember>();

  const canAdd = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );

  const columns: DataTableColumn<IdentityMember>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      render: (identity) => (
        <RowLink
          link={go.link(accessLinks.projectIdentity(scope, identity.id))}
          title={identity.name}
        >
          {identity.name}
        </RowLink>
      )
    },
    {
      id: "role",
      header: "Product role",
      render: (identity) => <ProductRoleBadge role={identity.role} />
    },
    {
      id: "managed",
      header: "Managed by",
      render: (identity) => <ManagedByBadge identity={identity} />
    }
  ];

  const remove = async () => {
    const identity = removing;
    setRemoving(undefined);
    if (!identity) return;
    try {
      if (identity.isManagedByAgentVault) {
        await deleteManaged.mutateAsync({ identityId: identity.id });
        saved(`${identity.name} deleted`);
      } else {
        await revoke.mutateAsync({ machineIdentityIds: [identity.id] });
        saved(`${identity.name} removed`);
      }
    } catch (error) {
      failed(
        identity.isManagedByAgentVault
          ? "Failed to delete machine identity"
          : "Failed to remove machine identity",
        error
      );
    }
  };

  const managed = Boolean(removing?.isManagedByAgentVault);
  const verb = managed ? "Delete" : "Remove";

  return (
    <Stack gap={16}>
      <FilterBar
        label="Machine identity filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search machine identities..."
            placeholder="Search machine identities..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canAdd}>
            <Button variant="accent" icon="plus" disabled={!canAdd} onClick={() => setAdding(true)}>
              Add machine identity
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Machine identities"
        rows={list.rows}
        columns={columns}
        rowActions={{
          renderMenu: (identity) => (
            <>
              <DropdownMenuItem onSelect={() => setEditing(identity)}>
                <Icon name="user" />
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(identity)}>
                <Icon icon={Trash2Icon} />
                {identity.isManagedByAgentVault ? "Delete" : "Remove"}
              </DropdownMenuItem>
            </>
          )
        }}
        getRowId={(identity) => identity.id}
        rowLabel={(identity) => identity.name}
        loading={list.isPending}
        loadingRows={10}
        empty={
          (Boolean(list.error) && (
            <EmptyState size="sm" icon="alert" title="Couldn't load machine identities" />
          )) ||
          (list.searching ? (
            <EmptyState size="sm" icon="search" title="No machine identities match search" />
          ) : (
            <EmptyState size="sm" icon="machine" title="No machine identities yet" />
          ))
        }
        pagination={list.pagination}
      />
      <AddProjectIdentitySheet
        orgId={orgId}
        projectId={projectId}
        open={adding}
        onOpenChange={setAdding}
      />
      <ChangeRoleDialog
        projectId={projectId}
        member={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing?.name ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`${verb} ${removing?.name ?? "machine identity"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {managed
                ? "This machine identity is managed by Agent Vault. Deleting it removes the identity along with its access. This cannot be undone."
                : "It loses access to this project, along with every access bundle granted to it. The machine identity isn't deleted because Agent Vault doesn't manage it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {verb}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
