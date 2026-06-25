import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BotIcon, MoreHorizontalIcon, PencilIcon, Plus, SearchIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import {
  useListPamProductIdentities,
  useRemovePamProductIdentityMember
} from "@app/hooks/api/pam";
import { TPamMember } from "@app/hooks/api/pam/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddIdentityModal } from "./AddIdentityModal";
import { IdentityRoleModal } from "./IdentityRoleModal";

export const IdentitiesTab = () => {
  const { currentOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [isAddIdentityOpen, setIsAddIdentityOpen] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<TPamMember | null>(null);
  const [identityToRemove, setIdentityToRemove] = useState<TPamMember | null>(null);

  const { data: identities = [], isPending } = useListPamProductIdentities();
  const removeIdentity = useRemovePamProductIdentityMember();

  const { data: orgIdentitiesData } = useGetIdentityMembershipOrgs({
    organizationId: currentOrg.id,
    limit: 1000
  });

  const identityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (orgIdentitiesData?.identityMemberships) {
      for (const m of orgIdentitiesData.identityMemberships) {
        map.set(m.identity.id, m.identity.name);
      }
    }
    return map;
  }, [orgIdentitiesData]);

  const getIdentityName = (member: TPamMember) =>
    (member.identityId && identityNameMap.get(member.identityId)) ||
    member.identityId?.slice(0, 12) ||
    "Unknown";

  const filteredIdentities = useMemo(
    () =>
      identities.filter((member) => {
        const name = getIdentityName(member);
        return name.toLowerCase().includes(search.toLowerCase());
      }),
    [identities, search, identityNameMap]
  );

  const handleDeleteIdentity = async () => {
    if (!identityToRemove) return;
    if (!identityToRemove.identityId) return;
    await removeIdentity.mutateAsync({ identityId: identityToRemove.identityId });
    createNotification({ text: "Identity removed", type: "success" });
    setIdentityToRemove(null);
  };

  const selectedIdentityName = selectedIdentity ? getIdentityName(selectedIdentity) : undefined;
  const removeIdentityName = identityToRemove ? getIdentityName(identityToRemove) : undefined;

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
            <Empty>
              <EmptyHeader>
                <BotIcon className="size-10 text-muted" />
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
              {filteredIdentities.map((member) => {
                const name = getIdentityName(member);
                const primaryRole = member.role ?? ProjectMembershipRole.Member;
                return (
                  <TableRow key={member.membershipId}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <button type="button" onClick={() => setSelectedIdentity(member)}>
                        <Badge
                          variant={primaryRole === ProjectMembershipRole.Admin ? "pam" : "neutral"}
                        >
                          {formatProjectRoleName(primaryRole)}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {member.createdAt
                        ? format(new Date(member.createdAt), "MMM d, yyyy")
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
        identityName={selectedIdentityName}
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
        title={`Remove ${removeIdentityName ?? "identity"}?`}
        deleteKey="remove"
        buttonText="Remove"
        onDeleteApproved={handleDeleteIdentity}
      />
    </div>
  );
};
