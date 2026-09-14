import { useMemo, useState } from "react";
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
import { HighlightText } from "@app/components/v2/HighlightText";
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
  agentVaultKeys,
  useListAgentVaultProductIdentityMembers,
  useRemoveAgentVaultProductMember
} from "@app/hooks/api/agentVault";
import { TAgentVaultProductIdentityMember } from "@app/hooks/api/agentVault/types";
import { useDeleteProjectIdentity, useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { CreateProjectIdentitySheet } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/CreateProjectIdentity/CreateProjectIdentitySheet";

import { ProductRoleDialog } from "./ProductRoleDialog";

export const IdentitiesTab = () => {
  const { currentProject } = useProject();
  const { currentOrg, isSubOrganization } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: identities = [], isPending } = useListAgentVaultProductIdentityMembers();
  const removeMember = useRemoveAgentVaultProductMember();
  const deleteIdentity = useDeleteProjectIdentity();
  const updateIdentity = useUpdateProjectIdentity();

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toEdit, setToEdit] = useState<TAgentVaultProductIdentityMember | null>(null);
  const [toRemove, setToRemove] = useState<TAgentVaultProductIdentityMember | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return identities.filter((identity) => identity.name.toLowerCase().includes(term));
  }, [identities, search]);

  // An identity created here is scoped to the Agent Vault project, so detaching it would orphan it.
  // Those are deleted outright.
  const isAgentVaultManaged = (identity: TAgentVaultProductIdentityMember) =>
    identity.identityProjectId === currentProject.id;

  const renderManagedByBadge = (identity: TAgentVaultProductIdentityMember) => {
    if (isAgentVaultManaged(identity)) {
      return (
        <Badge variant="av">
          <VaultIcon />
          Agent Vault
        </Badge>
      );
    }
    if (isSubOrganization && currentOrg.id === identity.identityOrgId) {
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
      if (!toRemove?.identityId) return;

      if (isAgentVaultManaged(toRemove)) {
        // Identities are created here with delete protection on, which the delete endpoint refuses.
        await updateIdentity.mutateAsync({
          identityId: toRemove.identityId,
          projectId: currentProject.id,
          hasDeleteProtection: false
        });
        await deleteIdentity.mutateAsync({
          identityId: toRemove.identityId,
          projectId: currentProject.id
        });
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.productMembers(currentOrg.id) });
        createNotification({ text: `"${toRemove.name}" deleted`, type: "success" });
      } else {
        await removeMember.mutateAsync({ identityId: toRemove.identityId });
        createNotification({ text: `"${toRemove.name}" removed`, type: "success" });
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
            onChange={(e) => setSearch(e.target.value)}
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
                {search ? "No machine identities match your search" : "No machine identities yet"}
              </EmptyTitle>
              <EmptyDescription>
                {search
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
                  key={identity.membershipId}
                  className={identity.identityId ? "cursor-pointer" : undefined}
                  onClick={() => {
                    if (!identity.identityId) return;
                    navigate({
                      to: "/organizations/$orgId/agent-vault/identities/$identityId",
                      params: { orgId: currentOrg.id, identityId: identity.identityId }
                    });
                  }}
                >
                  <TableCell isTruncatable className="min-w-32" title={identity.name}>
                    <HighlightText text={identity.name} highlight={search} />
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

      <CreateProjectIdentitySheet isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <ProductRoleDialog
        isOpen={Boolean(toEdit)}
        onOpenChange={() => setToEdit(null)}
        subject={toEdit?.name ?? ""}
        currentRole={toEdit?.role ?? ProjectMembershipRole.Member}
        actor={toEdit?.identityId ? { identityId: toEdit.identityId } : {}}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(toRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setToRemove(null);
        }}
        title={
          toRemove && isAgentVaultManaged(toRemove)
            ? `Delete "${toRemove.name}"`
            : `Remove "${toRemove?.name ?? ""}"`
        }
        description={
          toRemove && isAgentVaultManaged(toRemove)
            ? "This identity lives in Agent Vault, so it is deleted along with its access. This cannot be undone."
            : "The identity itself is left alone. It loses access and every bundle granted to it."
        }
        confirmKey={toRemove?.name ?? ""}
        confirmLabel={toRemove && isAgentVaultManaged(toRemove) ? "Delete" : "Remove"}
        isPending={removeMember.isPending || updateIdentity.isPending || deleteIdentity.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
