import { useMemo, useState } from "react";
import { HardDriveIcon, SearchIcon, UserIcon, UsersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Spinner } from "@app/components/v2";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  useGetIdentityMembershipOrgs,
  useGetOrganizationGroups
} from "@app/hooks/api/organization";
import { TPkiApplicationMember, useAddPkiApplicationMember } from "@app/hooks/api/pkiApplications";
import { useGetOrgUsers } from "@app/hooks/api/users";

type ActorType = "user" | "identity" | "group";

type Props = {
  applicationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingMembers: TPkiApplicationMember[];
};

const PLACEHOLDER: Record<ActorType, string> = {
  user: "Search users by name or email…",
  identity: "Search identities by name…",
  group: "Search groups by name…"
};

export const AddApplicationMemberModal = ({
  applicationId,
  isOpen,
  onOpenChange,
  existingMembers
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";
  const [type, setType] = useState<ActorType>("user");
  const [search, setSearch] = useState("");
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [role, setRole] = useState("operator");
  const addMember = useAddPkiApplicationMember();

  // Cert Manager projects don't use project-level memberships, so eligible
  // members are scoped to the organization rather than the project.
  const usersQuery = useGetOrgUsers(orgId);
  const identitiesQuery = useGetIdentityMembershipOrgs({ organizationId: orgId, limit: 100 });
  const groupsQuery = useGetOrganizationGroups(orgId);

  const taken = useMemo(() => {
    const set = new Set<string>();
    existingMembers.forEach((m) => {
      if (m.actorUserId) set.add(`user:${m.actorUserId}`);
      if (m.actorIdentityId) set.add(`identity:${m.actorIdentityId}`);
      if (m.actorGroupId) set.add(`group:${m.actorGroupId}`);
    });
    return set;
  }, [existingMembers]);

  const items: { id: string; primary: string; secondary?: string }[] = useMemo(() => {
    const norm = search.trim().toLowerCase();

    if (type === "user") {
      const users = usersQuery.data ?? [];
      return users
        .filter((u) => !taken.has(`user:${u.user.id}`))
        .map((u) => ({
          id: u.user.id,
          primary:
            [u.user.firstName, u.user.lastName].filter(Boolean).join(" ").trim() ||
            u.user.username ||
            u.user.email ||
            u.user.id,
          secondary: u.user.email ?? u.user.username ?? undefined
        }))
        .filter(
          (i) =>
            !norm ||
            i.primary.toLowerCase().includes(norm) ||
            (i.secondary?.toLowerCase().includes(norm) ?? false)
        );
    }

    if (type === "identity") {
      const memberships = identitiesQuery.data?.identityMemberships ?? [];
      return memberships
        .filter((im) => !taken.has(`identity:${im.identity.id}`))
        .map((im) => ({
          id: im.identity.id,
          primary: im.identity.name,
          secondary: im.identity.authMethods?.[0] ?? undefined
        }))
        .filter((i) => !norm || i.primary.toLowerCase().includes(norm));
    }

    const groups = groupsQuery.data ?? [];
    return groups
      .filter((g) => !taken.has(`group:${g.id}`))
      .map((g) => ({
        id: g.id,
        primary: g.name,
        secondary: g.slug
      }))
      .filter(
        (i) =>
          !norm ||
          i.primary.toLowerCase().includes(norm) ||
          (i.secondary?.toLowerCase().includes(norm) ?? false)
      );
  }, [type, search, taken, usersQuery.data, identitiesQuery.data, groupsQuery.data]);

  const isLoadingByType: Record<ActorType, boolean> = {
    user: usersQuery.isPending,
    identity: identitiesQuery.isPending,
    group: groupsQuery.isPending
  };
  const isLoading = isLoadingByType[type];

  const reset = () => {
    setType("user");
    setSearch("");
    setSelectedActorId(null);
    setRole("operator");
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleTypeChange = (next: ActorType) => {
    setType(next);
    setSelectedActorId(null);
    setSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedActorId) return;
    try {
      await addMember.mutateAsync({
        applicationId,
        role,
        userId: type === "user" ? selectedActorId : undefined,
        identityId: type === "identity" ? selectedActorId : undefined,
        groupId: type === "group" ? selectedActorId : undefined
      });
      createNotification({ type: "success", text: "Member added" });
      handleClose(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to add member.";
      createNotification({ type: "error", text: detail });
    }
  };

  const TYPE_OPTIONS: { value: ActorType; label: string; icon: typeof UserIcon }[] = [
    { value: "user", label: "Users", icon: UserIcon },
    { value: "identity", label: "Machine Identities", icon: HardDriveIcon },
    { value: "group", label: "Groups", icon: UsersIcon }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Grant access to this Application. Only organization members are eligible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={twMerge(
                    "flex flex-1 items-center justify-center gap-2 rounded px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-mineshaft-500 text-foreground"
                      : "text-accent hover:bg-mineshaft-600 hover:text-foreground"
                  )}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={PLACEHOLDER[type]}
            />
          </InputGroup>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {isLoading && (
              <div className="flex items-center justify-center p-6">
                <Spinner />
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Nothing to add</EmptyTitle>
                  <EmptyDescription>
                    Every eligible {type} is already a member of this Application.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {!isLoading && items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-full">Name</TableHead>
                    <TableHead className="w-10 text-right">Selected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isSelected = selectedActorId === item.id;
                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedActorId(isSelected ? null : item.id)}
                        className={twMerge(
                          "cursor-pointer",
                          isSelected && "bg-mineshaft-700 hover:bg-mineshaft-700"
                        )}
                      >
                        <TableCell isTruncatable>
                          <div className="min-w-0">
                            <div className="truncate">{item.primary}</div>
                            {item.secondary ? (
                              <div className="truncate text-xs text-accent">{item.secondary}</div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            isChecked={isSelected}
                            onCheckedChange={() => setSelectedActorId(isSelected ? null : item.id)}
                            aria-label={`Select ${item.primary}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-accent">Role:</span>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            isDisabled={!selectedActorId || addMember.isPending}
            isPending={addMember.isPending}
            onClick={handleSubmit}
          >
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
