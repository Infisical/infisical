import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon, PencilIcon, Plus, SearchIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  OrgIcon,
  ProjectIcon,
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
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  pamKeys,
  useListPamProductIdentities,
  useRemovePamProductIdentityMember
} from "@app/hooks/api/pam";
import { TPamIdentityMember } from "@app/hooks/api/pam/types";
import { useDeleteProjectIdentity } from "@app/hooks/api/projectIdentity";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { CreateProjectIdentitySheet } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/CreateProjectIdentity/CreateProjectIdentitySheet";

import { IdentityRoleModal } from "./IdentityRoleModal";

export const IdentitiesTab = () => {
  const { currentProject } = useProject();
  const { currentOrg, isSubOrganization } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isAddIdentityOpen, setIsAddIdentityOpen] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<TPamIdentityMember | null>(null);
  const [identityToRemove, setIdentityToRemove] = useState<TPamIdentityMember | null>(null);

  const { data: identities = [], isPending } = useListPamProductIdentities();

  const removeIdentity = useRemovePamProductIdentityMember();
  const deleteIdentity = useDeleteProjectIdentity();
  const isRemoving = removeIdentity.isPending || deleteIdentity.isPending;

  const filteredIdentities = useMemo(
    () => identities.filter((member) => member.name.toLowerCase().includes(search.toLowerCase())),
    [identities, search]
  );

  // Identities created inside PAM are scoped to the PAM project; removing their membership would
  // orphan them, so they are deleted outright. Org-level identities just lose their membership.
  const isPamManaged = (member: TPamIdentityMember) =>
    member.identityProjectId === currentProject.id;
  const isRemovingManagedIdentity = identityToRemove ? isPamManaged(identityToRemove) : false;

  const renderManagedByBadge = (member: TPamIdentityMember) => {
    if (isPamManaged(member)) {
      return (
        <Badge variant="project">
          <ProjectIcon />
          PAM
        </Badge>
      );
    }
    if (isSubOrganization && currentOrg.id === member.identityOrgId) {
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

  // Rejections keep the confirm dialog open (callers swallow them); the global mutation
  // error handler owns the toast.
  const handleDeleteIdentity = async () => {
    if (!identityToRemove?.identityId) return;

    if (isPamManaged(identityToRemove)) {
      await deleteIdentity.mutateAsync({
        identityId: identityToRemove.identityId,
        projectId: currentProject.id
      });
      queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
      createNotification({ text: "Identity deleted", type: "success" });
    } else {
      await removeIdentity.mutateAsync({
        identityId: identityToRemove.identityId,
        projectId: currentProject.id
      });
      createNotification({ text: "Identity removed", type: "success" });
    }

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
                <TableHead>Managed by</TableHead>
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
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              {filteredIdentities.map((member) => (
                <TableRow
                  key={member.membershipId}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/pam/identities/$identityId",
                      params: { orgId: currentOrg.id, identityId: member.identityId! }
                    })
                  }
                >
                  <TableCell className="font-medium">
                    <HighlightText text={member.name} highlight={search} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIdentity(member);
                      }}
                    >
                      <Badge
                        variant={member.role === ProjectMembershipRole.Admin ? "pam" : "neutral"}
                      >
                        {formatProjectRoleName(member.role)}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>{renderManagedByBadge(member)}</TableCell>
                  <TableCell className="text-sm text-muted">
                    {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                              onClick={() => setSelectedIdentity(member)}
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
                              onClick={() => setIdentityToRemove(member)}
                            >
                              <Trash2Icon />
                              {isPamManaged(member) ? "Delete" : "Remove"}
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateProjectIdentitySheet isOpen={isAddIdentityOpen} onOpenChange={setIsAddIdentityOpen} />

      <IdentityRoleModal
        identity={selectedIdentity}
        isOpen={!!selectedIdentity}
        onOpenChange={(open) => {
          if (!open) setSelectedIdentity(null);
        }}
      />

      <AlertDialog
        open={!!identityToRemove}
        confirmationValue={isRemovingManagedIdentity ? "delete" : "remove"}
        onOpenChange={(isOpen) => {
          if (!isOpen && isRemoving) return;
          if (!isOpen) setIdentityToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRemovingManagedIdentity ? "Delete Identity" : "Remove Identity From PAM"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRemovingManagedIdentity ? (
                <>
                  Permanently delete{" "}
                  <span className="font-medium text-foreground">{identityToRemove?.name}</span>.
                  This identity is managed by PAM and cannot be recovered.
                </>
              ) : (
                <>
                  Remove{" "}
                  <span className="font-medium text-foreground">
                    {identityToRemove?.name ?? "this identity"}
                  </span>{" "}
                  from PAM. The identity loses its PAM access but remains available in your
                  organization.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{ disabled: isRemoving }}
            onConfirm={() => handleDeleteIdentity().catch(() => undefined)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteIdentity().catch(() => undefined);
              }}
            >
              {isRemovingManagedIdentity ? "Delete Identity" : "Remove From PAM"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
