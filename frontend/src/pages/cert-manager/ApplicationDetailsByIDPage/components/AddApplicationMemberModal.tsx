import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { useProject } from "@app/context";
import {
  TPkiApplicationMember,
  useAddPkiApplicationMember,
  useAddPkiApplicationUserMembers
} from "@app/hooks/api/pkiApplications";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

type ActorType = "user" | "identity" | "group";

type Props = {
  applicationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingMembers: TPkiApplicationMember[];
};

type Option = { value: string; label: string };

type AppRoleOption = { slug: string; name: string; description?: string };

const APP_ROLES: AppRoleOption[] = [
  {
    slug: "admin",
    name: "Admin",
    description: "Manage members, profiles, and approval policies for this application."
  },
  {
    slug: "operator",
    name: "Operator",
    description: "Issue certificates and submit approval requests for this application."
  },
  {
    slug: "auditor",
    name: "Auditor",
    description: "View certificates, members, and activity on this application."
  }
];

const formatMemberOptionLabel = (option: Option, meta: { context: "menu" | "value" }) => (
  <span className={meta.context === "value" ? "block max-w-[22rem] truncate" : "block truncate"}>
    {option.label}
  </span>
);

const runSequential = async <T,>(items: T[], fn: (item: T) => Promise<void>): Promise<void> => {
  await items.reduce<Promise<void>>(async (prev, item) => {
    await prev;
    await fn(item);
  }, Promise.resolve());
};

const NoUserOptions = () => (
  <p>
    No matching members. Grant users access from the Access Control page, then return here to attach
    them to this Application.
  </p>
);

const NoIdentityOptions = () => (
  <p>
    No matching identities. Grant machine identities access from the Access Control page, then
    return here to attach them to this Application.
  </p>
);

const NoGroupOptions = () => (
  <p>
    No matching groups. Grant groups access from the Access Control page, then return here to attach
    them to this Application.
  </p>
);

export const AddApplicationMemberModal = ({
  applicationId,
  isOpen,
  onOpenChange,
  existingMembers
}: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";

  const [type, setType] = useState<ActorType>("user");
  const [selectedUsers, setSelectedUsers] = useState<Option[]>([]);
  const [selectedIdentities, setSelectedIdentities] = useState<Option[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Option[]>([]);
  const [role, setRole] = useState("operator");
  const [submitting, setSubmitting] = useState(false);

  // includeGroupMembers so users who only have project access via a group still appear.
  const usersQuery = useGetWorkspaceUsers(projectId, true);
  const identitiesQuery = useListProjectIdentityMemberships({
    projectId,
    projectType: ProjectType.CertificateManager,
    limit: 1000
  });
  const groupsQuery = useListWorkspaceGroups(projectId, ProjectType.CertificateManager);

  const projectGroups = groupsQuery.data ?? [];
  const groupIdentityQueries = useQueries({
    queries: projectGroups.map((gm) => ({
      queryKey: ["pki-application-add-member", "group-identities", gm.group.id],
      enabled: isOpen,
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          machineIdentities: { id: string; name: string }[];
        }>(`/api/v1/groups/${gm.group.id}/machine-identities`, {
          params: { offset: 0, limit: 1000 }
        });
        return data.machineIdentities;
      }
    }))
  });
  const groupIdentities = groupIdentityQueries.flatMap((q) => q.data ?? []);

  const addMember = useAddPkiApplicationMember();
  const addUserMembers = useAddPkiApplicationUserMembers();

  const taken = useMemo(() => {
    const set = new Set<string>();
    existingMembers.forEach((m) => {
      if (m.actorUserId) set.add(`user:${m.actorUserId}`);
      if (m.actorIdentityId) set.add(`identity:${m.actorIdentityId}`);
      if (m.actorGroupId) set.add(`group:${m.actorGroupId}`);
    });
    return set;
  }, [existingMembers]);

  const userOptions: Option[] = useMemo(() => {
    const users = usersQuery.data ?? [];
    return users
      .filter((u) => !taken.has(`user:${u.user.id}`))
      .map((u) => ({
        value: u.user.id,
        label:
          [u.user.firstName, u.user.lastName].filter(Boolean).join(" ").trim() ||
          u.user.username ||
          u.user.email ||
          u.user.id
      }));
  }, [usersQuery.data, taken]);

  const identityOptions: Option[] = useMemo(() => {
    const byId = new Map<string, Option>();
    (identitiesQuery.data?.identityMemberships ?? []).forEach((im) => {
      if (!taken.has(`identity:${im.identity.id}`)) {
        byId.set(im.identity.id, { value: im.identity.id, label: im.identity.name });
      }
    });
    groupIdentities.forEach((i) => {
      if (!taken.has(`identity:${i.id}`) && !byId.has(i.id)) {
        byId.set(i.id, { value: i.id, label: i.name });
      }
    });
    return Array.from(byId.values());
  }, [identitiesQuery.data, groupIdentities, taken]);

  const groupOptions: Option[] = useMemo(() => {
    const memberships = groupsQuery.data ?? [];
    return memberships
      .filter((gm) => !taken.has(`group:${gm.group.id}`))
      .map((gm) => ({ value: gm.group.id, label: gm.group.name }));
  }, [groupsQuery.data, taken]);

  const reset = () => {
    setType("user");
    setSelectedUsers([]);
    setSelectedIdentities([]);
    setSelectedGroups([]);
    setRole("operator");
  };

  const handleTypeChange = (next: ActorType) => {
    if (next === type) return;
    setSelectedUsers([]);
    setSelectedIdentities([]);
    setSelectedGroups([]);
    setType(next);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const submitUsers = async () => {
    if (selectedUsers.length === 0) return;
    const userIds = selectedUsers.map((u) => u.value);

    const result = await addUserMembers.mutateAsync({
      applicationId,
      userIds,
      emails: [],
      role
    });

    if (result.unresolved.length > 0) {
      const labelById = new Map(selectedUsers.map((u) => [u.value, u.label]));
      const names = result.unresolved.map((id) => labelById.get(id) ?? id);
      createNotification({
        type: "warning",
        text: `Couldn't add ${names.length === 1 ? "this user" : "these users"}: ${names.join(", ")}. Grant them access from the Access Control page and try again.`
      });
    }
  };

  const submitIdentities = async () => {
    if (selectedIdentities.length === 0) return;
    await runSequential(selectedIdentities, async (item) => {
      await addMember.mutateAsync({ applicationId, kind: "identity", memberId: item.value, role });
    });
  };

  const submitGroups = async () => {
    if (selectedGroups.length === 0) return;
    await runSequential(selectedGroups, async (item) => {
      await addMember.mutateAsync({ applicationId, kind: "group", memberId: item.value, role });
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (type === "user") await submitUsers();
      if (type === "identity") await submitIdentities();
      if (type === "group") await submitGroups();
      createNotification({ type: "success", text: "Members added" });
      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add members"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_OPTIONS: { value: ActorType; label: string; icon: typeof UserIcon }[] = [
    { value: "user", label: "Users", icon: UserIcon },
    { value: "identity", label: "Machine Identities", icon: HardDriveIcon },
    { value: "group", label: "Groups", icon: UsersIcon }
  ];

  const selectedByType: Record<ActorType, number> = {
    user: selectedUsers.length,
    identity: selectedIdentities.length,
    group: selectedGroups.length
  };
  const selectedCount = selectedByType[type];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Grant access to this Application. Select existing members, identities, or groups to
            attach. New members must first be granted access from the Access Control page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ButtonGroup className="w-full">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = type === opt.value;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  variant={active ? "project" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleTypeChange(opt.value)}
                  aria-pressed={active}
                >
                  <Icon />
                  {opt.label}
                </Button>
              );
            })}
          </ButtonGroup>

          {type === "user" && (
            <FormControl label="Users">
              <FilterableSelect
                isMulti
                isLoading={usersQuery.isPending}
                options={userOptions}
                value={selectedUsers}
                onChange={(v) => setSelectedUsers((v ?? []) as Option[])}
                placeholder="Select existing members…"
                formatOptionLabel={formatMemberOptionLabel}
                noOptionsMessage={NoUserOptions}
              />
            </FormControl>
          )}

          {type === "identity" && (
            <FormControl label="Machine Identities">
              <FilterableSelect
                isMulti
                isLoading={identitiesQuery.isPending}
                options={identityOptions}
                value={selectedIdentities}
                onChange={(v) => setSelectedIdentities((v ?? []) as Option[])}
                placeholder="Select existing identities…"
                formatOptionLabel={formatMemberOptionLabel}
                noOptionsMessage={NoIdentityOptions}
              />
            </FormControl>
          )}

          {type === "group" && (
            <FormControl label="Groups">
              <FilterableSelect
                isMulti
                isLoading={groupsQuery.isPending}
                options={groupOptions}
                value={selectedGroups}
                onChange={(v) => setSelectedGroups((v ?? []) as Option[])}
                placeholder="Select groups…"
                formatOptionLabel={formatMemberOptionLabel}
                noOptionsMessage={NoGroupOptions}
              />
            </FormControl>
          )}

          <FormControl label="Role">
            <FilterableSelect
              options={APP_ROLES}
              value={APP_ROLES.find((r) => r.slug === role) ?? null}
              onChange={(v) => {
                const next = v as AppRoleOption | null;
                if (next) setRole(next.slug);
              }}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              components={{ Option: RoleOption }}
              isClearable={false}
            />
          </FormControl>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            isDisabled={selectedCount === 0 || submitting}
            isPending={submitting}
            onClick={handleSubmit}
          >
            Add Member{selectedCount > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
