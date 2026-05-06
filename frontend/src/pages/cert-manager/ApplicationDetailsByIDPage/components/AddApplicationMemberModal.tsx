import { useMemo, useState } from "react";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";
import {
  useGetIdentityMembershipOrgs,
  useGetOrganizationGroups
} from "@app/hooks/api/organization";
import { useCreateOrgIdentity } from "@app/hooks/api/orgIdentity";
import { TPkiApplicationMember, useAddPkiApplicationMember } from "@app/hooks/api/pkiApplications";
import {
  useCreateProjectIdentityMembership,
  useListProjectIdentityMemberships
} from "@app/hooks/api/projectIdentityMembership";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetOrgUsers } from "@app/hooks/api/users";

type ActorType = "user" | "identity" | "group";

type Props = {
  applicationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingMembers: TPkiApplicationMember[];
};

type Option = { value: string; label: string; isNew?: boolean };

const APP_ROLES = [
  { slug: "admin", label: "Admin" },
  { slug: "operator", label: "Operator" },
  { slug: "auditor", label: "Auditor" }
];

type CertManagerInviteResponse = {
  memberships: Array<{ id: string; userId: string }>;
};

const runSequential = async <T,>(items: T[], fn: (item: T) => Promise<void>): Promise<void> => {
  await items.reduce<Promise<void>>(async (prev, item) => {
    await prev;
    await fn(item);
  }, Promise.resolve());
};

const NoUserOptions = () => (
  <p>
    No matching org members. Type a full email to invite a new user — they&apos;ll receive an email
    and be added to this Application.
  </p>
);

const NoIdentityOptions = () => (
  <p>
    No matching identities. Type a name to create a new machine identity in the org and attach it to
    this Application.
  </p>
);

export const AddApplicationMemberModal = ({
  applicationId,
  isOpen,
  onOpenChange,
  existingMembers
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";

  const [type, setType] = useState<ActorType>("user");
  const [selectedUsers, setSelectedUsers] = useState<Option[]>([]);
  const [selectedIdentities, setSelectedIdentities] = useState<Option[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Option[]>([]);
  const [role, setRole] = useState("operator");
  const [submitting, setSubmitting] = useState(false);

  const usersQuery = useGetOrgUsers(orgId);
  const identitiesQuery = useGetIdentityMembershipOrgs({ organizationId: orgId, limit: 100 });
  const groupsQuery = useGetOrganizationGroups(orgId);

  const projectIdentitiesQuery = useListProjectIdentityMemberships({
    projectId: "",
    projectType: ProjectType.CertificateManager,
    limit: 1000
  });
  const identityIdsAlreadyInProject = useMemo(() => {
    const memberships = projectIdentitiesQuery.data?.identityMemberships ?? [];
    return new Set(memberships.map((m) => m.identity.id));
  }, [projectIdentitiesQuery.data]);

  const addMember = useAddPkiApplicationMember();
  const createIdentity = useCreateOrgIdentity();
  const addIdentityToProject = useCreateProjectIdentityMembership();

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
    const memberships = identitiesQuery.data?.identityMemberships ?? [];
    return memberships
      .filter((im) => !taken.has(`identity:${im.identity.id}`))
      .map((im) => ({ value: im.identity.id, label: im.identity.name }));
  }, [identitiesQuery.data, taken]);

  const groupOptions: Option[] = useMemo(() => {
    const groups = groupsQuery.data ?? [];
    return groups
      .filter((g) => !taken.has(`group:${g.id}`))
      .map((g) => ({ value: g.id, label: g.name }));
  }, [groupsQuery.data, taken]);

  const reset = () => {
    setType("user");
    setSelectedUsers([]);
    setSelectedIdentities([]);
    setSelectedGroups([]);
    setRole("operator");
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const submitUsers = async () => {
    if (selectedUsers.length === 0) return;
    const orgUsers = usersQuery.data ?? [];
    const existing = selectedUsers.filter((u) => !u.isNew);
    const newInviteEmails = selectedUsers.filter((u) => u.isNew).map((u) => u.value);

    let invitedMemberships: CertManagerInviteResponse["memberships"] = [];
    if (newInviteEmails.length > 0 || existing.length > 0) {
      const usernames = [
        ...newInviteEmails,
        ...existing
          .map((u) => {
            const o = orgUsers.find((x) => x.user.id === u.value);
            return o?.user.username || o?.user.email || null;
          })
          .filter((x): x is string => Boolean(x))
      ];
      const { data } = await apiRequest.post<CertManagerInviteResponse>(
        "/api/v1/cert-manager/access/users",
        { usernames, roleSlugs: ["member"] }
      );
      invitedMemberships = data.memberships ?? [];
    }

    const userIds: string[] = [];
    existing.forEach((u) => userIds.push(u.value));
    if (newInviteEmails.length > 0) {
      const refreshed = (await usersQuery.refetch()).data ?? [];
      newInviteEmails.forEach((email) => {
        const fromResponse = invitedMemberships.find((m) => Boolean(m.userId));
        const fromOrg = refreshed.find(
          (o) => o.user.email === email || o.user.username === email || o.inviteEmail === email
        );
        if (fromOrg?.user.id) userIds.push(fromOrg.user.id);
        else if (fromResponse?.userId) userIds.push(fromResponse.userId);
      });
    }

    await runSequential(userIds, async (userId) => {
      await addMember.mutateAsync({ applicationId, userId, role });
    });
  };

  const submitIdentities = async () => {
    if (selectedIdentities.length === 0) return;
    const identityIds: string[] = [];
    await runSequential(selectedIdentities, async (item) => {
      if (item.isNew) {
        const created = await createIdentity.mutateAsync({
          organizationId: orgId,
          name: item.value,
          hasDeleteProtection: false
        });
        identityIds.push(created.id);
      } else {
        identityIds.push(item.value);
      }
    });

    const idsNeedingProjectMembership = identityIds.filter(
      (id) => !identityIdsAlreadyInProject.has(id)
    );
    await runSequential(idsNeedingProjectMembership, async (identityId) => {
      await addIdentityToProject.mutateAsync({
        identityId,
        projectId: "",
        projectType: ProjectType.CertificateManager,
        role: "member"
      });
    });

    await runSequential(identityIds, async (identityId) => {
      await addMember.mutateAsync({ applicationId, identityId, role });
    });
  };

  const submitGroups = async () => {
    if (selectedGroups.length === 0) return;
    await runSequential(selectedGroups, async (item) => {
      await addMember.mutateAsync({ applicationId, groupId: item.value, role });
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

  const isEmail = (s: string) => z.string().email().safeParse(s).success;
  const isIdentityName = (s: string) => s.trim().length > 0;

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
            Grant access to this Application. Select one or more existing org members to attach
            them, or type a new email/identity name to create and attach in one step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
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

          {type === "user" && (
            <FormControl
              label="Users"
              helperText="Pick existing organization members or type a new email to invite + add."
            >
              <CreatableSelect
                isMulti
                isLoading={usersQuery.isPending}
                options={userOptions}
                value={selectedUsers}
                onChange={(v) => setSelectedUsers((v ?? []) as Option[])}
                placeholder="Select users or type an email…"
                onCreateOption={(input) => {
                  if (!isEmail(input)) return;
                  setSelectedUsers((prev) => [
                    ...prev,
                    { value: input, label: input, isNew: true }
                  ]);
                }}
                isValidNewOption={(input) => isEmail(input)}
                formatCreateLabel={(input) => `Invite "${input}"`}
                noOptionsMessage={NoUserOptions}
              />
            </FormControl>
          )}

          {type === "identity" && (
            <FormControl
              label="Machine Identities"
              helperText="Pick existing identities or type a new name to create + add."
            >
              <CreatableSelect
                isMulti
                isLoading={identitiesQuery.isPending}
                options={identityOptions}
                value={selectedIdentities}
                onChange={(v) => setSelectedIdentities((v ?? []) as Option[])}
                placeholder="Select identities or type a new name…"
                onCreateOption={(input) => {
                  if (!isIdentityName(input)) return;
                  setSelectedIdentities((prev) => [
                    ...prev,
                    { value: input.trim(), label: input.trim(), isNew: true }
                  ]);
                }}
                isValidNewOption={(input) => isIdentityName(input)}
                formatCreateLabel={(input) => `Create identity "${input}"`}
                noOptionsMessage={NoIdentityOptions}
              />
            </FormControl>
          )}

          {type === "group" && (
            <FormControl
              label="Groups"
              helperText="Pick one or more organization groups to grant access through."
            >
              <FilterableSelect
                isMulti
                isLoading={groupsQuery.isPending}
                options={groupOptions}
                value={selectedGroups}
                onChange={(v) => setSelectedGroups((v ?? []) as Option[])}
                placeholder="Select groups…"
              />
            </FormControl>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-accent">Role:</span>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((r) => (
                  <SelectItem key={r.slug} value={r.slug}>
                    {r.label}
                  </SelectItem>
                ))}
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
