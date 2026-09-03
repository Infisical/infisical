import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Skeleton
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { useDebounce } from "@app/hooks";
import {
  useAddGroupToWorkspace,
  useGetProjectRoles,
  useListWorkspaceGroups,
  useSearchOrganizationGroups
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  group: z.object({ id: z.string(), name: z.string() }),
  role: z.object({ slug: z.string(), name: z.string() })
});

export type FormData = z.infer<typeof schema>;

const GROUP_PAGE_SIZE = 20;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
};

// TODO: update backend to support adding multiple roles at once

const Content = ({ onClose }: { onClose: () => void }) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const isStandaloneProduct = isCertManager;
  const productLabel =
    isStandaloneProduct && currentProject ? getProjectTitle(currentProject.type) : "Project";

  const orgId = currentOrg?.id || "";

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebounce(searchInput);

  const {
    data: orgGroupsData,
    isError: isGroupsError,
    isFetching: isGroupsFetching,
    isPending: isGroupsPending,
    refetch: refetchGroups
  } = useSearchOrganizationGroups({
    organizationId: orgId,
    search: debouncedSearch,
    limit: GROUP_PAGE_SIZE
  });
  const {
    data: groupMemberships,
    isError: isGroupMembershipsError,
    isFetching: isGroupMembershipsFetching,
    isPending: isGroupMembershipsPending,
    refetch: refetchGroupMemberships
  } = useListWorkspaceGroups(currentProject?.id || "", currentProject?.type);

  const {
    data: roles,
    isError: isRolesError,
    isFetching: isRolesFetching,
    isPending: isRolesPending,
    refetch: refetchRoles
  } = useGetProjectRoles(currentProject?.id || "", currentProject?.type);

  const { mutateAsync: addGroupToWorkspaceMutateAsync } = useAddGroupToWorkspace();

  const filteredGroupMembershipOrgs = useMemo(() => {
    const wsGroupIds = new Map();

    groupMemberships?.forEach((groupMembership) => {
      wsGroupIds.set(groupMembership.group.id, true);
    });

    return (orgGroupsData?.groups || []).filter(({ id }) => !wsGroupIds.has(id));
  }, [orgGroupsData?.groups, groupMemberships]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ group, role }: FormData) => {
    await addGroupToWorkspaceMutateAsync({
      projectId: currentProject?.id || "",
      projectType: currentProject?.type,
      groupId: group.id,
      role: role.slug || undefined
    });

    reset();
    onClose();

    createNotification({
      text: `Successfully added group to ${productLabel.toLowerCase()}`,
      type: "success"
    });
  };

  const isDataPending = isGroupsPending || isGroupMembershipsPending || isRolesPending;
  const isDataError = isGroupsError || isGroupMembershipsError || isRolesError;
  const isRetrying = isGroupsFetching || isGroupMembershipsFetching || isRolesFetching;

  if (isDataPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading groups and roles">
        <Field>
          <FieldLabel>Group</FieldLabel>
          <Skeleton className="h-9 w-full" />
        </Field>
        <Field>
          <FieldLabel>Role</FieldLabel>
          <Skeleton className="h-9 w-full" />
        </Field>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="project" type="button" isPending isDisabled>
            Add
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (isDataError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertTitle>Unable to load groups and roles</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load the information needed to add a group. Try again.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            type="button"
            isPending={isRetrying}
            isDisabled={isRetrying}
            onClick={async () => {
              await Promise.all([refetchGroups(), refetchGroupMemberships(), refetchRoles()]);
            }}
          >
            Try again
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const totalOrgGroups = orgGroupsData?.totalCount ?? 0;
  const assignedCount = groupMemberships?.length ?? 0;
  // totalCount is scoped to the active search, so only trust it against the project's group count
  // once both the input and the debounced query it drives are clear.
  const hasSearchTerm = Boolean(searchInput || debouncedSearch);
  const hasNoAvailableGroups = !hasSearchTerm && assignedCount >= totalOrgGroups;
  const isGroupListTruncated = totalOrgGroups > GROUP_PAGE_SIZE;

  const noOptionsMessage = () => {
    if (hasSearchTerm) return "No groups match your search";
    return `The first ${GROUP_PAGE_SIZE} groups are already added. Search by name to find others.`;
  };

  return !hasNoAvailableGroups ? (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        name="group"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="group">Group</FieldLabel>
            <FilterableSelect
              inputId="group"
              value={value}
              onChange={onChange}
              placeholder="Select group..."
              autoFocus
              isError={Boolean(error)}
              isLoading={isGroupsFetching || searchInput !== debouncedSearch}
              options={isGroupsFetching ? [] : filteredGroupMembershipOrgs}
              onInputChange={(newValue, actionMeta) => {
                if (actionMeta.action === "input-change") {
                  setSearchInput(newValue);
                }
              }}
              filterOption={() => true}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              noOptionsMessage={noOptionsMessage}
            />
            <FieldDescription>
              {isGroupListTruncated ? "Search by name to find groups that are not listed." : null}
            </FieldDescription>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <FilterableSelect
              inputId="role"
              value={value}
              onChange={onChange}
              options={roles ?? []}
              placeholder="Select role..."
              isError={Boolean(error)}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              components={{ Option: RoleOption }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="project" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          Add
        </Button>
      </DialogFooter>
    </form>
  ) : (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {totalOrgGroups === 0
          ? "Your organization has no groups yet. Create one at the organization level to add it to this project."
          : "Every group in your organization is already added. To add another group, create one at the organization level first."}
      </p>
      <DialogFooter>
        <Button asChild variant="outline">
          <Link
            to={"/organizations/$orgId/access-management" as const}
            params={{ orgId }}
            search={{ selectedTab: "groups" }}
          >
            Go to organization groups <ArrowRightIcon />
          </Link>
        </Button>
      </DialogFooter>
    </div>
  );
};

export const GroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const isStandaloneProduct = isCertManager;
  const productLabel =
    isStandaloneProduct && currentProject ? getProjectTitle(currentProject.type) : "Project";

  return (
    <Dialog
      open={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("group", isOpen)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Add Group to ${productLabel}`}</DialogTitle>
          <DialogDescription>
            Select an organization group and assign its {productLabel.toLowerCase()} role.
          </DialogDescription>
        </DialogHeader>
        <Content onClose={() => handlePopUpToggle("group", false)} />
      </DialogContent>
    </Dialog>
  );
};
