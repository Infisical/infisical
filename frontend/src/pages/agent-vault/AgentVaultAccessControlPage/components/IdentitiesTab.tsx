import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  VaultIcon
} from "lucide-react";

import { ProductRoleBadge } from "@app/components/agent-vault/ProductRoleBadge";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
  OrgIcon,
  Pagination,
  Skeleton,
  SubOrgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  agentVaultKeys,
  useListAgentVaultMembers,
  useRevokeAgentVaultMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";
import { useDeleteProjectIdentity, useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import { CreateProjectIdentitySheet } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/CreateProjectIdentity/CreateProjectIdentitySheet";

import { ProductRoleDialog } from "./ProductRoleDialog";

type TMachineIdentityMember = TAgentVaultProductMemberOf<AgentVaultMemberType.MachineIdentity>;

export const IdentitiesTab = () => {
  const { currentProject } = useProject();
  const { currentOrg, isSubOrganization } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultAccessControlTable", PreferenceKey.PerPage, 20)
  );

  const { data, isPending } = useListAgentVaultMembers({
    actorType: AgentVaultMemberType.MachineIdentity,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const revokeMembers = useRevokeAgentVaultMembers();
  const deleteIdentity = useDeleteProjectIdentity();
  const updateIdentity = useUpdateProjectIdentity();

  const filtered = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  const isFiltered = Boolean(debouncedSearch.trim());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toEdit, setToEdit] = useState<TMachineIdentityMember | null>(null);
  const [toRemove, setToRemove] = useState<TMachineIdentityMember | null>(null);

  // An identity created here is scoped to the Agent Vault project, so detaching it would orphan it.
  const isAgentVaultManaged = (member: TMachineIdentityMember) =>
    member.actor.isManagedByAgentVault;

  const renderManagedByBadge = (identity: TMachineIdentityMember) => {
    if (isAgentVaultManaged(identity)) {
      return (
        <Badge variant="av">
          <VaultIcon />
          Agent Vault
        </Badge>
      );
    }
    if (isSubOrganization && currentOrg.id === identity.actor.orgId) {
      return (
        <Badge variant="sub-org">
          <SubOrgIcon />
          Sub-Organization
        </Badge>
      );
    }
    return (
      <Badge variant="org">
        <OrgIcon />
        Organization
      </Badge>
    );
  };

  const handleRemove = async () => {
    try {
      if (!toRemove) return;

      if (isAgentVaultManaged(toRemove)) {
        // Identities are created here with delete protection on, which the delete endpoint refuses.
        await updateIdentity.mutateAsync({
          identityId: toRemove.actor.id,
          projectId: currentProject.id,
          hasDeleteProtection: false
        });
        await deleteIdentity.mutateAsync({
          identityId: toRemove.actor.id,
          projectId: currentProject.id
        });
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(currentOrg.id) });
        createNotification({ text: `"${toRemove.actor.name}" deleted`, type: "success" });
      } else {
        await revokeMembers.mutateAsync({ machineIdentityIds: [toRemove.actor.id] });
        createNotification({ text: `"${toRemove.actor.name}" removed`, type: "success" });
      }

      setToRemove(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search machine identities..."
          />
        </InputGroup>
        <ProjectPermissionCan
          I={ProjectPermissionIdentityActions.Create}
          a={ProjectPermissionSub.Identity}
        >
          {(isAllowed) => (
            <Button variant="av" isDisabled={!isAllowed} onClick={() => setIsAddOpen(true)}>
              <PlusIcon />
              Add Machine Identity
            </Button>
          )}
        </ProjectPermissionCan>
      </CardContent>

      {!isPending && filtered.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {isFiltered
                  ? "No machine identities match your search"
                  : "No machine identities yet"}
              </EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? "Try a different search term."
                  : "Add a machine identity to give it access."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-2/3">
                Name
              </TableHead>
              <TableHead>Product Role</TableHead>
              <TableHead>Managed By</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`identity-skeleton-${index}`}>
                  {Array.from({ length: 4 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`identity-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isPending &&
              filtered.map((identity) => (
                <TableRow
                  key={identity.id}
                  className="cursor-pointer"
                  onClick={() => {
                    navigate({
                      to: "/organizations/$orgId/agent-vault/identities/$identityId",
                      params: { orgId: currentOrg.id, identityId: identity.actor.id }
                    });
                  }}
                >
                  <TableCell isTruncatable className="min-w-32" title={identity.actor.name}>
                    <HighlightText text={identity.actor.name} highlight={debouncedSearch} />
                  </TableCell>
                  <TableCell>
                    <ProductRoleBadge role={identity.role} />
                  </TableCell>
                  <TableCell>{renderManagedByBadge(identity)}</TableCell>
                  <TableCell variant="action" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="Open identity actions">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem onClick={() => setToEdit(identity)}>
                          <PencilIcon />
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="danger" onClick={() => setToRemove(identity)}>
                          <Trash2Icon />
                          {isAgentVaultManaged(identity) ? "Delete" : "Remove"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      {totalCount > 0 && (
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(newPerPage) => {
              setPerPage(newPerPage);
              setPage(1);
              setUserTablePreference(
                "agentVaultAccessControlTable",
                PreferenceKey.PerPage,
                newPerPage
              );
            }}
          />
        </CardContent>
      )}

      <CreateProjectIdentitySheet isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <ProductRoleDialog
        member={toEdit}
        onOpenChange={() => setToEdit(null)}
        subject={toEdit?.actor.name ?? ""}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(toRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setToRemove(null);
        }}
        title={
          toRemove && isAgentVaultManaged(toRemove)
            ? `Delete "${toRemove.actor.name}"`
            : `Remove "${toRemove?.actor.name ?? ""}"`
        }
        description={
          toRemove && isAgentVaultManaged(toRemove)
            ? "This machine identity is managed by Agent Vault. Deleting it removes the identity along with its access. This cannot be undone."
            : "It loses Agent Vault access, along with every access bundle granted to it. The machine identity won't be deleted because it isn't managed by Agent Vault."
        }
        confirmKey={toRemove?.actor.name ?? ""}
        confirmLabel={toRemove && isAgentVaultManaged(toRemove) ? "Delete" : "Remove"}
        isPending={revokeMembers.isPending || updateIdentity.isPending || deleteIdentity.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
