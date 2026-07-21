import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MoreHorizontalIcon, PencilIcon, Plus, SearchIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useListProjectIdentityMemberships } from "@app/hooks/api";
import { IdentityProjectMembershipV2 } from "@app/hooks/api/identities/types";
import { useRemovePamProductIdentityMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddIdentityModal } from "./AddIdentityModal";
import { IdentityRoleModal } from "./IdentityRoleModal";

export const IdentitiesTab = () => {
  const { currentProject } = useProject();
  const [search, setSearch] = useState("");
  const [isAddIdentityOpen, setIsAddIdentityOpen] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityProjectMembershipV2 | null>(
    null
  );
  const [identityToRemove, setIdentityToRemove] = useState<IdentityProjectMembershipV2 | null>(
    null
  );

  const { data: identitiesData, isPending } = useListProjectIdentityMemberships({
    projectId: currentProject.id,
    projectType: currentProject.type
  });
  const identities = identitiesData?.identityMemberships ?? [];

  const removeIdentity = useRemovePamProductIdentityMember();

  const filteredIdentities = useMemo(
    () =>
      identities.filter((membership) =>
        membership.identity.name.toLowerCase().includes(search.toLowerCase())
      ),
    [identities, search]
  );

  const handleDeleteIdentity = async () => {
    if (!identityToRemove) return;
    await removeIdentity.mutateAsync({
      identityId: identityToRemove.identity.id,
      projectId: currentProject.id
    });
    createNotification({ text: "Identity removed", type: "success" });
    setIdentityToRemove(null);
  };

  return (
    <div>
      <Card>
        <CardContent className="flex items-center gap-3">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search identities..."
            />
          </InputGroup>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Identity}
          >
            {(isAllowed) => (
              <Button
                variant="pam"
                isDisabled={!isAllowed}
                onClick={() => setIsAddIdentityOpen(true)}
              >
                <Plus className="mr-1 size-4" />
                Add Identity
              </Button>
            )}
          </ProjectPermissionCan>
        </CardContent>

        {!isPending && filteredIdentities.length === 0 ? (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {search ? "No identities match your search" : "No identities found"}
                </EmptyTitle>
                <EmptyDescription>
                  {search
                    ? "Try a different search term."
                    : "Add machine identities to manage access."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              {filteredIdentities.map((membership) => {
                const primaryRole = membership.roles?.[0]?.role ?? ProjectMembershipRole.Member;
                return (
                  <TableRow key={membership.id}>
                    <TableCell className="font-medium">
                      <HighlightText text={membership.identity.name} highlight={search} />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => setSelectedIdentity(membership)}>
                        <Badge
                          variant={primaryRole === ProjectMembershipRole.Admin ? "pam" : "neutral"}
                        >
                          {formatProjectRoleName(
                            primaryRole,
                            membership.roles?.[0]?.customRoleName
                          )}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {membership.createdAt
                        ? format(new Date(membership.createdAt), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="Identity actions"
                            className="text-muted"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => setSelectedIdentity(membership)}
                              >
                                <PencilIcon />
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <DropdownMenuSeparator />
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => setIdentityToRemove(membership)}
                              >
                                <Trash2Icon />
                                Remove
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddIdentityModal isOpen={isAddIdentityOpen} onOpenChange={setIsAddIdentityOpen} />

      <IdentityRoleModal
        identity={selectedIdentity}
        isOpen={!!selectedIdentity}
        onOpenChange={(open) => {
          if (!open) setSelectedIdentity(null);
        }}
      />

      <DeleteActionModal
        isOpen={!!identityToRemove}
        onChange={(isOpen) => {
          if (!isOpen) setIdentityToRemove(null);
        }}
        title={`Remove ${identityToRemove?.identity.name ?? "identity"}?`}
        deleteKey="remove"
        buttonText="Remove"
        onDeleteApproved={handleDeleteIdentity}
      />
    </div>
  );
};
