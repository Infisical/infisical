import { MultiSelect, type MultiSelectOption } from "@app/components/v4/ui/multi-select";
import { getMemberLabel } from "@app/helpers/members";
import type { TGroupMembership } from "@app/hooks/api/groups/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { failed } from "../../../access/toast";
import { isValidMemberEmail } from "./policy-form.schema";

export const MEMBER_EMAIL_HINT = "Enter an exact project member email address.";

export type PickedUser<T extends string> = {
  type: T;
  id?: string;
  username?: string;
  name?: string;
  isOrgMembershipActive?: boolean;
};
export type PickedGroup<T extends string> = { type: T; id: string; name?: string };

const valueOf = (type: string, key?: string) => `${type}:${key ?? ""}`;

export const ApproverPicker = <TUser extends string, TGroup extends string>({
  label,
  placeholder,
  members,
  groups,
  users: selectedUsers,
  groupsValue: selectedGroups,
  userType,
  groupType,
  invalid,
  onChange
}: {
  label: string;
  placeholder: string;
  members: TWorkspaceUser[];
  groups: TGroupMembership[];
  users: PickedUser<TUser>[];
  groupsValue: PickedGroup<TGroup>[];
  userType: TUser;
  groupType: TGroup;
  invalid?: boolean;
  onChange: (next: { users: PickedUser<TUser>[]; groups: PickedGroup<TGroup>[] }) => void;
}) => {
  const memberById = new Map(members.map((member) => [member.user.id, member] as const));
  const groupById = new Map(groups.map(({ group }) => [group.id, group] as const));
  const memberOptions: MultiSelectOption[] = members.map((member) => ({
    value: valueOf(userType, member.user.id),
    label: getMemberLabel(member),
    description: member.user.isOrgMembershipActive === false ? "Inactive" : member.user.username,
    disabled: member.user.isOrgMembershipActive === false,
    group: "Members"
  }));
  const groupOptions: MultiSelectOption[] = groups.map(({ group }) => ({
    value: valueOf(groupType, group.id),
    label: group.name,
    group: "Groups"
  }));
  const known = new Set([...memberOptions, ...groupOptions].map((option) => option.value));
  const extra: MultiSelectOption[] = [
    ...selectedUsers
      .filter((entry) => !known.has(valueOf(userType, entry.id ?? entry.username)))
      .map((entry) => ({
        value: valueOf(userType, entry.id ?? entry.username),
        label: entry.name ?? entry.username ?? entry.id ?? "Unknown approver",
        description: entry.id ? "Not in this project" : "Member email",
        group: "Members"
      })),
    ...selectedGroups
      .filter((entry) => !known.has(valueOf(groupType, entry.id)))
      .map((entry) => ({
        value: valueOf(groupType, entry.id),
        label: entry.name ?? entry.id,
        description: "Not in this project",
        group: "Groups"
      }))
  ];
  const options = [
    ...memberOptions,
    ...extra.filter((o) => o.group === "Members"),
    ...groupOptions,
    ...extra.filter((o) => o.group === "Groups")
  ];
  const value = [
    ...selectedUsers.map((entry) => valueOf(userType, entry.id ?? entry.username)),
    ...selectedGroups.map((entry) => valueOf(groupType, entry.id))
  ];

  const toSelection = (values: string[]) => {
    const previousUsers = new Map(
      selectedUsers.map((entry) => [valueOf(userType, entry.id ?? entry.username), entry] as const)
    );
    const previousGroups = new Map(
      selectedGroups.map((entry) => [valueOf(groupType, entry.id), entry] as const)
    );
    const users: PickedUser<TUser>[] = [];
    const picked: PickedGroup<TGroup>[] = [];
    values.forEach((entry) => {
      const [type, key] = [entry.slice(0, entry.indexOf(":")), entry.slice(entry.indexOf(":") + 1)];
      if (type === groupType) {
        const group = groupById.get(key);
        picked.push(previousGroups.get(entry) ?? { type: groupType, id: key, name: group?.name });
        return;
      }
      const member = memberById.get(key);
      users.push(
        member
          ? {
              type: userType,
              id: member.user.id,
              name: getMemberLabel(member),
              isOrgMembershipActive: member.user.isOrgMembershipActive
            }
          : (previousUsers.get(entry) ?? { type: userType, username: key, name: key })
      );
    });
    return { users, groups: picked };
  };

  return (
    <MultiSelect
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      searchable
      invalid={invalid}
      onChange={(next) => onChange(toSelection(next as string[]))}
      onCreate={(query) => {
        const username = query.trim().toLowerCase();
        if (!isValidMemberEmail(username)) {
          failed(MEMBER_EMAIL_HINT);
          return;
        }
        const taken =
          members.some((member) => member.user.username.toLowerCase() === username) ||
          selectedUsers.some((entry) => entry.username?.toLowerCase() === username);
        if (taken) {
          failed("Member already listed");
          return;
        }
        onChange({
          users: [...selectedUsers, { type: userType, username, name: username }],
          groups: selectedGroups
        });
      }}
    />
  );
};
