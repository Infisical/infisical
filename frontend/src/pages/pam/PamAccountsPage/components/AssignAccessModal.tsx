import { useMemo, useState } from "react";
import { components, OptionProps } from "react-select";
import { BotIcon, CheckIcon, User as UserIcon, Users as UsersIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import {
  TPamResourceRole,
  useAddAccountGroupMember,
  useAddAccountIdentityMember,
  useAddAccountMember,
  useAddFolderGroupMember,
  useAddFolderIdentityMember,
  useAddFolderMember,
  useListPamProductGroups,
  useListPamProductIdentities,
  useListPamProductMembers,
  useListPamResourceRoles,
  useUpdateAccountGroupMemberRole,
  useUpdateAccountIdentityMemberRole,
  useUpdateAccountMemberRole,
  useUpdateFolderGroupMemberRole,
  useUpdateFolderIdentityMemberRole,
  useUpdateFolderMemberRole
} from "@app/hooks/api/pam";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import { PamMemberKind, PamMembershipScope } from "../../components/memberEnums";

type AssigneeOption = {
  value: string;
  label: string;
  kind: PamMemberKind;
  subtitle: string;
};

export type EditMemberTarget = {
  kind: PamMemberKind;
  id: string;
  label: string;
  role: string;
};

const EXPIRY_OPTIONS = [
  { value: "none", label: "No expiry" },
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" },
  { value: "14d", label: "2 weeks" },
  { value: "30d", label: "1 month" }
];

const ASSIGNEE_ICON: Record<PamMemberKind, typeof UserIcon> = {
  [PamMemberKind.User]: UserIcon,
  [PamMemberKind.Group]: UsersIcon,
  [PamMemberKind.Identity]: BotIcon
};

const AssigneeSelectOption = ({ children, ...props }: OptionProps<AssigneeOption>) => {
  const Icon = ASSIGNEE_ICON[props.data.kind];
  return (
    <components.Option {...props}>
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="truncate">{children}</p>
          {props.data.subtitle && (
            <p className="truncate text-xs leading-4 text-muted">{props.data.subtitle}</p>
          )}
        </div>
      </div>
    </components.Option>
  );
};

const ResourceRoleOption = ({ isSelected, children, ...props }: OptionProps<TPamResourceRole>) => (
  <components.Option isSelected={isSelected} {...props}>
    <div className="flex items-start justify-between gap-2 whitespace-normal">
      <div className="min-w-0">
        <p>{children}</p>
        {props.data.description && (
          <p className="text-xs leading-4 text-muted">{props.data.description}</p>
        )}
      </div>
      {isSelected && <CheckIcon className="mt-0.5 size-4 shrink-0" />}
    </div>
  </components.Option>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scope: PamMembershipScope;
  resourceId: string;
  existingUserIds: Set<string>;
  existingGroupIds: Set<string>;
  existingIdentityIds: Set<string>;
  editMember?: EditMemberTarget | null;
};

export const AssignAccessModal = ({
  isOpen,
  onOpenChange,
  scope,
  resourceId,
  existingUserIds,
  existingGroupIds,
  existingIdentityIds,
  editMember
}: Props) => {
  const { currentOrg } = useOrganization();
  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);
  const { data: orgGroups } = useGetOrganizationGroups(currentOrg.id);
  const { data: orgIdentities } = useGetIdentityMembershipOrgs({ organizationId: currentOrg.id });
  const { data: productMembers } = useListPamProductMembers();
  const { data: productGroups } = useListPamProductGroups();
  const { data: productIdentities } = useListPamProductIdentities();
  const { data: resourceRoles } = useListPamResourceRoles();

  const addAccountUser = useAddAccountMember();
  const addAccountGroup = useAddAccountGroupMember();
  const addAccountIdentity = useAddAccountIdentityMember();
  const addFolderUser = useAddFolderMember();
  const addFolderGroup = useAddFolderGroupMember();
  const addFolderIdentity = useAddFolderIdentityMember();
  const updateAccountUser = useUpdateAccountMemberRole();
  const updateAccountGroup = useUpdateAccountGroupMemberRole();
  const updateAccountIdentity = useUpdateAccountIdentityMemberRole();
  const updateFolderUser = useUpdateFolderMemberRole();
  const updateFolderGroup = useUpdateFolderGroupMemberRole();
  const updateFolderIdentity = useUpdateFolderIdentityMemberRole();

  const isEdit = Boolean(editMember);

  const [selectedActor, setSelectedActor] = useState<AssigneeOption | null>(null);
  const [roleSlug, setRoleSlug] = useState<string>("");
  const [expiry, setExpiry] = useState<string>("none");

  // Default to Requester
  const defaultRoleSlug = useMemo(() => {
    if (!resourceRoles?.length) return "";
    return (
      resourceRoles.find((r) => r.slug === "requester")?.slug ??
      resourceRoles[resourceRoles.length - 1].slug
    );
  }, [resourceRoles]);
  const effectiveRoleSlug = roleSlug || editMember?.role || defaultRoleSlug;

  const lockedActor = useMemo<AssigneeOption | null>(() => {
    if (!editMember) return null;
    const subtitleMap: Record<PamMemberKind, string> = {
      [PamMemberKind.User]: "",
      [PamMemberKind.Group]: "Group",
      [PamMemberKind.Identity]: "Machine Identity"
    };
    return {
      value: editMember.id,
      label: editMember.label,
      kind: editMember.kind,
      subtitle: subtitleMap[editMember.kind]
    };
  }, [editMember]);

  const pamUserIds = useMemo(
    () => new Set((productMembers ?? []).map((m) => m.userId).filter(Boolean) as string[]),
    [productMembers]
  );
  const pamGroupIds = useMemo(
    () => new Set((productGroups ?? []).map((m) => m.groupId).filter(Boolean) as string[]),
    [productGroups]
  );
  const pamIdentityIds = useMemo(
    () => new Set((productIdentities ?? []).map((m) => m.identityId).filter(Boolean) as string[]),
    [productIdentities]
  );

  const assigneeOptions = useMemo<AssigneeOption[]>(() => {
    const groups: AssigneeOption[] = (orgGroups ?? [])
      .filter((g) => pamGroupIds.has(g.id) && !existingGroupIds.has(g.id))
      .map((g) => ({ value: g.id, label: g.name, kind: PamMemberKind.Group, subtitle: "Group" }));

    const users: AssigneeOption[] = (orgUsers ?? [])
      .filter((ou) => ou.user.id && pamUserIds.has(ou.user.id) && !existingUserIds.has(ou.user.id))
      .map((ou) => {
        const name = [ou.user.firstName, ou.user.lastName].filter(Boolean).join(" ");
        return {
          value: ou.user.id,
          label: name || ou.user.email || ou.inviteEmail || ou.user.username,
          kind: PamMemberKind.User,
          subtitle: ou.user.email ?? ou.inviteEmail ?? ""
        };
      });

    const existingIds = existingIdentityIds ?? new Set<string>();
    const identities: AssigneeOption[] = (orgIdentities?.identityMemberships ?? [])
      .filter((im) => pamIdentityIds.has(im.identity.id) && !existingIds.has(im.identity.id))
      .map((im) => ({
        value: im.identity.id,
        label: im.identity.name,
        kind: PamMemberKind.Identity,
        subtitle: "Machine Identity"
      }));

    return [...groups, ...identities, ...users];
  }, [
    orgGroups,
    orgUsers,
    orgIdentities,
    pamGroupIds,
    pamUserIds,
    pamIdentityIds,
    existingGroupIds,
    existingUserIds,
    existingIdentityIds
  ]);

  const selectedRole = (resourceRoles ?? []).find((r) => r.slug === effectiveRoleSlug) ?? null;

  const isPending =
    addAccountUser.isPending ||
    addAccountGroup.isPending ||
    addAccountIdentity.isPending ||
    addFolderUser.isPending ||
    addFolderGroup.isPending ||
    addFolderIdentity.isPending ||
    updateAccountUser.isPending ||
    updateAccountGroup.isPending ||
    updateAccountIdentity.isPending ||
    updateFolderUser.isPending ||
    updateFolderGroup.isPending ||
    updateFolderIdentity.isPending;

  const reset = () => {
    setSelectedActor(null);
    setRoleSlug("");
    setExpiry("none");
  };

  const handleEdit = () => {
    if (!editMember || !effectiveRoleSlug) return;

    const opts = {
      onSuccess: () => {
        createNotification({ type: "success", text: "Role updated" });
        reset();
        onOpenChange(false);
      }
    };

    if (scope === PamMembershipScope.Account && editMember.kind === PamMemberKind.User) {
      updateAccountUser.mutate(
        { accountId: resourceId, userId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    } else if (scope === PamMembershipScope.Account && editMember.kind === PamMemberKind.Group) {
      updateAccountGroup.mutate(
        { accountId: resourceId, groupId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    } else if (scope === PamMembershipScope.Account && editMember.kind === PamMemberKind.Identity) {
      updateAccountIdentity.mutate(
        { accountId: resourceId, identityId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    } else if (editMember.kind === PamMemberKind.User) {
      updateFolderUser.mutate(
        { folderId: resourceId, userId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    } else if (editMember.kind === PamMemberKind.Group) {
      updateFolderGroup.mutate(
        { folderId: resourceId, groupId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    } else {
      updateFolderIdentity.mutate(
        { folderId: resourceId, identityId: editMember.id, role: effectiveRoleSlug },
        opts
      );
    }
  };

  const handleAssign = () => {
    if (!selectedActor || !effectiveRoleSlug) return;
    const expiryValue = expiry === "none" ? null : expiry;

    const opts = {
      onSuccess: () => {
        createNotification({ type: "success", text: "Access assigned" });
        reset();
        onOpenChange(false);
      }
    };

    if (scope === PamMembershipScope.Account && selectedActor.kind === PamMemberKind.User) {
      addAccountUser.mutate(
        {
          accountId: resourceId,
          userId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    } else if (scope === PamMembershipScope.Account && selectedActor.kind === PamMemberKind.Group) {
      addAccountGroup.mutate(
        {
          accountId: resourceId,
          groupId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    } else if (
      scope === PamMembershipScope.Account &&
      selectedActor.kind === PamMemberKind.Identity
    ) {
      addAccountIdentity.mutate(
        {
          accountId: resourceId,
          identityId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    } else if (selectedActor.kind === PamMemberKind.User) {
      addFolderUser.mutate(
        {
          folderId: resourceId,
          userId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    } else if (selectedActor.kind === PamMemberKind.Group) {
      addFolderGroup.mutate(
        {
          folderId: resourceId,
          groupId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    } else {
      addFolderIdentity.mutate(
        {
          folderId: resourceId,
          identityId: selectedActor.value,
          role: effectiveRoleSlug,
          expiry: expiryValue
        },
        opts
      );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Access" : "Assign Access"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Assignee</FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={isEdit ? lockedActor : selectedActor}
                options={assigneeOptions}
                isDisabled={isEdit}
                onChange={(opt) => setSelectedActor((opt as AssigneeOption | null) ?? null)}
                getOptionValue={(opt) => `${opt.kind}:${opt.value}`}
                getOptionLabel={(opt) => opt.label}
                components={{ Option: AssigneeSelectOption }}
                placeholder="Pick a user, group, or identity..."
                noOptionsMessage={() => "No users, groups, or identities available to assign."}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={selectedRole}
                options={resourceRoles ?? []}
                onChange={(opt) => setRoleSlug((opt as TPamResourceRole | null)?.slug ?? "")}
                getOptionValue={(opt) => opt.slug}
                getOptionLabel={(opt) => opt.name}
                components={{ Option: ResourceRoleOption }}
                placeholder="Select a role..."
              />
            </FieldContent>
          </Field>

          {!isEdit && (
            <Field>
              <FieldLabel>Expiry</FieldLabel>
              <FieldContent>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {isEdit ? (
            <Button variant="pam" isPending={isPending} onClick={handleEdit}>
              Save
            </Button>
          ) : (
            <Button
              variant="pam"
              isPending={isPending}
              isDisabled={!selectedActor}
              onClick={handleAssign}
            >
              Assign
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
