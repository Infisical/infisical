import { useMemo, useState } from "react";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetOrganizationGroups } from "@app/hooks/api/organization";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SignerMemberRole,
  signerMemberRoleDescriptions,
  signerMemberRoleLabels,
  TSignerMember,
  useAddSignerGroupMember,
  useAddSignerIdentityMember,
  useAddSignerUserMembers
} from "@app/hooks/api/signers";
import { useGetOrgUsers } from "@app/hooks/api/users";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signerId: string;
  existingMembers: TSignerMember[];
};

type Kind = "user" | "identity" | "group";

type Option = { value: string; label: string };

export const AddSignerMemberModal = ({
  isOpen,
  onOpenChange,
  signerId,
  existingMembers
}: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const orgId = currentOrg?.id ?? "";
  const projectId = currentProject?.id ?? "";

  const [kind, setKind] = useState<Kind>("user");
  const [selectedUsers, setSelectedUsers] = useState<Option[]>([]);
  const [selectedIdentities, setSelectedIdentities] = useState<Option[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Option[]>([]);
  const [role, setRole] = useState<SignerMemberRole>(SignerMemberRole.Operator);
  const [submitting, setSubmitting] = useState(false);

  const usersQuery = useGetOrgUsers(orgId);
  const projectIdentitiesQuery = useListProjectIdentityMemberships({
    projectId,
    projectType: ProjectType.CertificateManager,
    limit: 1000
  });
  const groupsQuery = useGetOrganizationGroups(orgId);

  const addUserMembers = useAddSignerUserMembers();
  const addIdentityMember = useAddSignerIdentityMember();
  const addGroupMember = useAddSignerGroupMember();

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
    return (usersQuery.data ?? [])
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
    return (projectIdentitiesQuery.data?.identityMemberships ?? [])
      .filter((im) => !taken.has(`identity:${im.identity.id}`))
      .map((im) => ({ value: im.identity.id, label: im.identity.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [projectIdentitiesQuery.data, taken]);

  const groupOptions: Option[] = useMemo(() => {
    return (groupsQuery.data ?? [])
      .filter((g) => !taken.has(`group:${g.id}`))
      .map((g) => ({ value: g.id, label: g.name }));
  }, [groupsQuery.data, taken]);

  const reset = () => {
    setKind("user");
    setSelectedUsers([]);
    setSelectedIdentities([]);
    setSelectedGroups([]);
    setRole(SignerMemberRole.Operator);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      if (kind === "user" && selectedUsers.length > 0) {
        await addUserMembers.mutateAsync({
          signerId,
          userIds: selectedUsers.map((u) => u.value),
          emails: [],
          role
        });
      }
      if (kind === "identity" && selectedIdentities.length > 0) {
        await Promise.all(
          selectedIdentities.map((identity) =>
            addIdentityMember.mutateAsync({ signerId, identityId: identity.value, role })
          )
        );
        createNotification({ type: "success", text: "Members added" });
      }
      if (kind === "group" && selectedGroups.length > 0) {
        await Promise.all(
          selectedGroups.map((group) =>
            addGroupMember.mutateAsync({ signerId, groupId: group.value, role })
          )
        );
        createNotification({ type: "success", text: "Members added" });
      }
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

  const valueForKind =
    // eslint-disable-next-line no-nested-ternary
    kind === "user" ? selectedUsers : kind === "identity" ? selectedIdentities : selectedGroups;

  const optionsForKind =
    // eslint-disable-next-line no-nested-ternary
    kind === "user" ? userOptions : kind === "identity" ? identityOptions : groupOptions;

  const setSelected = (next: Option[]) => {
    if (kind === "user") setSelectedUsers(next);
    else if (kind === "identity") setSelectedIdentities(next);
    else setSelectedGroups(next);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Pick existing org members, machine identities, or groups to attach to this signer.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <ButtonGroup className="w-full">
            {[
              { value: "user" as const, label: "Users", icon: UserIcon },
              { value: "identity" as const, label: "Machine Identities", icon: HardDriveIcon },
              { value: "group" as const, label: "Groups", icon: UsersIcon }
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.value}
                  variant={kind === opt.value ? "project" : "outline"}
                  onClick={() => setKind(opt.value)}
                  className="flex-1"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </Button>
              );
            })}
          </ButtonGroup>

          <Field>
            <FieldLabel>
              {/* eslint-disable-next-line no-nested-ternary */}
              Select {kind === "user" ? "users" : kind === "identity" ? "identities" : "groups"}
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isMulti
                options={optionsForKind}
                value={valueForKind}
                onChange={(selected) => setSelected((selected as Option[] | null) ?? [])}
                placeholder="Pick..."
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <FieldContent>
              <Select value={role} onValueChange={(v) => setRole(v as SignerMemberRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={4}>
                  {Object.values(SignerMemberRole).map((r) => (
                    <SelectItem key={r} value={r} description={signerMemberRoleDescriptions[r]}>
                      {signerMemberRoleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button variant="project" onClick={onSubmit} isPending={submitting}>
            Add members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
