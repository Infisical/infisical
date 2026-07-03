import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { components, MultiValueGenericProps, OptionProps } from "react-select";
import { CheckIcon, HardDriveIcon, UserIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  useAddIdentityToGroup,
  useAddUserToGroup,
  useListGroupMachineIdentities,
  useListGroupUsers
} from "@app/hooks/api";
import { FilterReturnedMachineIdentities, FilterReturnedUsers } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum AddMemberType {
  Users = "users",
  MachineIdentities = "machineIdentities"
}

// Backend caps the list endpoints at 100 rows, so the select relies on server-side
// search (debounced input -> `search` param) rather than loading every candidate.
// With no search we pull a smaller balanced preview per type so both groups (users +
// machine identities) are visible up front instead of 100 users burying the identities.
const MEMBER_SEARCH_LIMIT = 100;
const MEMBER_PREVIEW_LIMIT = 10;

type MemberOption = {
  type: AddMemberType;
  // `id` is the mutation argument: username for users, identity id for machine identities.
  id: string;
  label: string;
  // shown inline after the label (muted), only for users (their email)
  email?: string;
};

const getOptionIcon = (type: AddMemberType) =>
  type === AddMemberType.Users ? UserIcon : HardDriveIcon;

const getTypeLabel = (type: AddMemberType) =>
  type === AddMemberType.Users ? "Users" : "Machine Identities";

// Dropdown row: type icon + name/username with the email inline (muted). Both texts get min-w-0 +
// truncate so a long name or email is ellipsized rather than wrapping or pushing the checkmark off.
const MemberOptionRow = ({ isSelected, ...props }: OptionProps<MemberOption>) => {
  const { type, label, email } = props.data;
  const Icon = getOptionIcon(type);

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 truncate">{label}</span>
        {email && email !== label && <span className="min-w-0 truncate text-muted">{email}</span>}
        {isSelected && <CheckIcon className="ml-auto size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

// Selected chip/badge: type icon + label (the remove button is left to the shared component).
const MemberMultiValueLabel = ({ children, ...props }: MultiValueGenericProps<MemberOption>) => {
  const Icon = getOptionIcon(props.data.type);

  return (
    <components.MultiValueLabel {...props}>
      <div className="flex items-center gap-1">
        <Icon className="size-3 shrink-0 text-muted" />
        <span className="truncate">{children}</span>
      </div>
    </components.MultiValueLabel>
  );
};

type Props = {
  popUp: UsePopUpState<["addGroupMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addGroupMembers"]>, state?: boolean) => void;
  isOidcManageGroupMembershipsEnabled: boolean;
};

export const AddGroupMembersModal = ({
  popUp,
  handlePopUpToggle,
  isOidcManageGroupMembershipsEnabled
}: Props) => {
  const popUpData = popUp?.addGroupMembers?.data as { groupId: string; slug: string } | undefined;
  const groupId = popUpData?.groupId ?? "";
  const groupSlug = popUpData?.slug ?? "";
  const isOpen = Boolean(popUp?.addGroupMembers?.isOpen);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  // Trim so a whitespace-only query isn't sent (the endpoints reject an all-spaces search).
  const trimmedSearch = debouncedSearch.trim();

  // Users can't be added when OIDC manages group membership, so skip that query entirely (an empty
  // slug makes the hook's `enabled` guard false) instead of fetching and discarding the results.
  const showUsers = !isOidcManageGroupMembershipsEnabled;

  const listLimit = trimmedSearch ? MEMBER_SEARCH_LIMIT : MEMBER_PREVIEW_LIMIT;

  const { mutateAsync: addUserToGroup } = useAddUserToGroup();
  const { mutateAsync: addIdentityToGroup } = useAddIdentityToGroup();

  const { data: usersData, isFetching: isUsersFetching } = useListGroupUsers({
    id: groupId,
    groupSlug: showUsers ? groupSlug : "",
    offset: 0,
    limit: listLimit,
    search: trimmedSearch,
    filter: FilterReturnedUsers.NON_MEMBERS
  });

  const { data: identitiesData, isFetching: isIdentitiesFetching } = useListGroupMachineIdentities({
    id: groupId,
    groupSlug,
    offset: 0,
    limit: listLimit,
    search: trimmedSearch,
    filter: FilterReturnedMachineIdentities.NON_ASSIGNED_MACHINE_IDENTITIES
  });

  const memberOptions = useMemo<MemberOption[]>(() => {
    const users: MemberOption[] = showUsers
      ? (usersData?.users ?? []).map((user) => {
          const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
          return {
            type: AddMemberType.Users,
            id: user.username,
            // Show the user's name when set, otherwise their username; email shown inline (muted).
            label: name || user.username,
            email: user.email
          };
        })
      : [];

    const identities: MemberOption[] = (identitiesData?.machineIdentities ?? []).map(
      (identity) => ({
        type: AddMemberType.MachineIdentities,
        id: identity.id,
        label: identity.name
      })
    );

    return [...users, ...identities];
  }, [usersData, identitiesData, showUsers]);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting }
  } = useForm<{ members: MemberOption[] }>({ defaultValues: { members: [] } });

  const selectedCount = watch("members").length;

  const resetState = () => {
    reset({ members: [] });
    setSearch("");
  };

  const handleOpenChange = (open: boolean) => {
    handlePopUpToggle("addGroupMembers", open);
    if (!open) resetState();
  };

  const onSubmit = async ({ members }: { members: MemberOption[] }) => {
    if (!groupId || !groupSlug) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    if (!members.length) return;

    const results = await Promise.allSettled(
      members.map((member) =>
        member.type === AddMemberType.Users
          ? addUserToGroup({ groupId, username: member.id, slug: groupSlug })
          : addIdentityToGroup({ groupId, identityId: member.id, slug: groupSlug })
      )
    );

    const failedMembers = members.filter((_, idx) => results[idx].status === "rejected");
    const succeededCount = results.length - failedMembers.length;

    if (succeededCount > 0) {
      createNotification({
        text: `Successfully assigned ${succeededCount} member${
          succeededCount === 1 ? "" : "s"
        } to the group`,
        type: "success"
      });
    }

    // Individual failures are surfaced by the global mutation error handler.
    if (!failedMembers.length) {
      handleOpenChange(false);
    } else {
      // Keep the dialog open with only the members that failed so they can be retried.
      reset({ members: failedMembers });
      setSearch("");
    }
  };

  const noOptionsMessage = () => {
    if (trimmedSearch) return "No members match your search";
    return isOidcManageGroupMembershipsEnabled
      ? "All machine identities are already in the group"
      : "All members are already in the group";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Group Members</DialogTitle>
          <DialogDescription>
            Search for members and assign them to this group. You can select multiple at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {isOidcManageGroupMembershipsEnabled && (
            <Alert variant="info">
              <AlertDescription>
                User membership for this group is managed through your OIDC provider. Assign users
                there; only machine identities can be added here.
              </AlertDescription>
            </Alert>
          )}
          <Controller
            control={control}
            name="members"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-group-members">
                  {isOidcManageGroupMembershipsEnabled ? "Machine Identities" : "Members"}
                </FieldLabel>
                <FilterableSelect
                  inputId="add-group-members"
                  isMulti
                  placeholder={
                    isOidcManageGroupMembershipsEnabled
                      ? "Search and select machine identities..."
                      : "Search and select users or machine identities..."
                  }
                  value={value}
                  onChange={onChange}
                  options={memberOptions}
                  groupBy="type"
                  getGroupHeaderLabel={getTypeLabel}
                  getOptionValue={(option) => `${option.type}:${option.id}`}
                  getOptionLabel={(option) => option.label}
                  filterOption={() => true}
                  onInputChange={(val, meta) => {
                    if (meta.action === "input-change") setSearch(val);
                  }}
                  isLoading={isUsersFetching || isIdentitiesFetching}
                  components={{ Option: MemberOptionRow, MultiValueLabel: MemberMultiValueLabel }}
                  isError={Boolean(error)}
                  noOptionsMessage={noOptionsMessage}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="org"
              type="submit"
              isPending={isSubmitting}
              isDisabled={isSubmitting || selectedCount === 0}
            >
              {selectedCount > 0
                ? `Assign ${selectedCount} Member${selectedCount === 1 ? "" : "s"}`
                : "Assign Members"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
