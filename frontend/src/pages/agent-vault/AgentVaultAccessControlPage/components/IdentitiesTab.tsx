import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionIdentityActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  useListAgentVaultProductIdentityMembers,
  useRemoveAgentVaultProductMember
} from "@app/hooks/api/agentVault";
import { TAgentVaultProductIdentityMember } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddIdentityDialog } from "./AddIdentityDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

export const IdentitiesTab = () => {
  const { currentProject } = useProject();
  const { data: identities = [], isPending } = useListAgentVaultProductIdentityMembers();
  const removeMember = useRemoveAgentVaultProductMember();

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toEdit, setToEdit] = useState<TAgentVaultProductIdentityMember | null>(null);
  const [toRemove, setToRemove] = useState<TAgentVaultProductIdentityMember | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return identities.filter((identity) => identity.name.toLowerCase().includes(term));
  }, [identities, search]);

  const handleRemove = async () => {
    if (!toRemove?.identityId) return;
    await removeMember.mutateAsync({
      projectId: currentProject.id,
      identityId: toRemove.identityId
    });
    createNotification({
      text: `"${toRemove.name}" no longer has access to Agent Vault`,
      type: "success"
    });
    setToRemove(null);
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
              Add Identity
            </Button>
          )}
        </ProjectPermissionCan>
      </CardContent>

      {!isPending && filtered.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {search ? "No identities match your search" : "No machine identities yet"}
              </EmptyTitle>
              <EmptyDescription>
                {search
                  ? "Try a different search term."
                  : "Add a machine identity so an agent can mint its own sessions."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Product Role</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`identity-skeleton-${index}`}>
                  {Array.from({ length: 3 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`identity-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isPending &&
              filtered.map((identity) => (
                <TableRow key={identity.membershipId}>
                  <TableCell>
                    <HighlightText text={identity.name} highlight={search} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={identity.role === ProjectMembershipRole.Admin ? "av" : "neutral"}
                    >
                      {formatProjectRoleName(identity.role)}
                    </Badge>
                  </TableCell>
                  <TableCell variant="action">
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
                        <DropdownMenuItem onClick={() => setToRemove(identity)}>
                          <Trash2Icon />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <AddIdentityDialog isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <ProductRoleDialog
        isOpen={Boolean(toEdit)}
        onOpenChange={() => setToEdit(null)}
        subject={toEdit?.name ?? ""}
        currentRole={toEdit?.role ?? ProjectMembershipRole.Member}
        actor={toEdit?.identityId ? { identityId: toEdit.identityId } : {}}
      />

      {/* Agent Vault never owns an identity, so removal only takes the membership away. PAM has to
          offer a delete here instead, because identities created inside PAM belong to it. */}
      <DeleteConfirmDialog
        isOpen={Boolean(toRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setToRemove(null);
        }}
        title={`Remove "${toRemove?.name ?? ""}" from Agent Vault`}
        description="The identity itself is left alone. It loses Agent Vault and every bundle granted to it."
        confirmKey={toRemove?.name ?? ""}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
