import { useMemo, useState } from "react";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
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
import { useOrganization, useProject } from "@app/context";
import {
  useGetIdentityMembershipOrgs,
  useGetOrganizationGroups
} from "@app/hooks/api/organization";
import {
  TPkiApplicationMember,
  useAddPkiApplicationMember,
  useAddPkiApplicationUserMembers
} from "@app/hooks/api/pkiApplications";
import { useCreateProjectIdentity } from "@app/hooks/api/projectIdentity";
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
    No matching identities. Type a name to create a new machine identity in this project and attach
    it to this Application.
  </p>
);

export const AddApplicationMemberModal = ({
  applicationId,
  isOpen,
  onOpenChange,
  existingMembers
}: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const orgId = currentOrg?.id ?? "";
  const projectId = currentProject?.id ?? "";

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
  const addUserMembers = useAddPkiApplicationUserMembers();
  const createProjectIdentity = useCreateProjectIdentity();
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

    const userIds: string[] = [];
    const emails: string[] = [];
    selectedUsers.forEach((u) => {
      if (u.isNew) emails.push(u.value);
      else userIds.push(u.value);
    });

    const result = await addUserMembers.mutateAsync({
      applicationId,
      userIds,
      emails,
      role
    });

    if (result.unresolved.length > 0) {
      createNotification({
        type: "warning",
        text: `Couldn't resolve ${result.unresolved.length === 1 ? "user" : "users"}: ${result.unresolved.join(", ")}. They were invited to the org but not yet attached to the Application.`
      });
    }
  };

  const submitIdentities = async () => {
    if (selectedIdentities.length === 0) return;
    const newlyCreatedIds = new Set<string>();
    const identityIds: string[] = [];
    await runSequential(selectedIdentities, async (item) => {
      if (item.isNew) {
        const created = await createProjectIdentity.mutateAsync({
          projectId,
          name: item.value,
          hasDeleteProtection: false
        });
        identityIds.push(created.id);
        newlyCreatedIds.add(created.id);
      } else {
        identityIds.push(item.value);
      }
    });

    const idsNeedingProjectMembership = identityIds.filter(
      (id) => !newlyCreatedIds.has(id) && !identityIdsAlreadyInProject.has(id)
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
      await addMember.mutateAsync({ applicationId, kind: "identity", memberId: identityId, role });
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
            <FormControl label="Machine Identities">
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
            <FormControl label="Groups">
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
