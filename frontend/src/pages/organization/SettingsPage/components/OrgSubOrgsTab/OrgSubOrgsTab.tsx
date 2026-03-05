import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  faArrowDownAZ,
  faArrowUpZA,
  faEllipsisV,
  faFolderOpen,
  faMagnifyingGlass,
  faPen,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon } from "lucide-react";
import { z } from "zod";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission, useUser } from "@app/context";
import { OrgPermissionSubOrgActions } from "@app/context/OrgPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper, useToggle } from "@app/hooks";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  subOrganizationsQuery,
  TSubOrganization,
  useDeleteSubOrganization,
  useJoinSubOrganization,
  useUpdateSubOrganization
} from "@app/hooks/api/subOrganizations";
import { usePopUp } from "@app/hooks/usePopUp";
import { NewSubOrganizationForm } from "@app/layouts/OrganizationLayout/components/NavBar/NewSubOrganizationForm";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

enum SubOrgOrderBy {
  Name = "name"
}

const editSubOrgSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().optional()
});

type EditSubOrgFormData = z.infer<typeof editSubOrgSchema>;

type SubOrgWithMember = TSubOrganization & { isMember: boolean };

export const OrgSubOrgsTab = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permission } = useOrgPermission();
  const { user } = useUser();
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);

  const canCreateSubOrg = permission.can(
    OrgPermissionSubOrgActions.Create,
    OrgPermissionSubjects.SubOrganization
  );
  const canEditSubOrg = permission.can(
    OrgPermissionSubOrgActions.Edit,
    OrgPermissionSubjects.SubOrganization
  );
  const canDeleteSubOrg = permission.can(
    OrgPermissionSubOrgActions.Delete,
    OrgPermissionSubjects.SubOrganization
  );
  const canDirectAccess = permission.can(
    OrgPermissionSubOrgActions.DirectAccess,
    OrgPermissionSubjects.SubOrganization
  );
  const canManageSubOrgs = canEditSubOrg || canDeleteSubOrg;

  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter);
  const [selectedSubOrg, setSelectedSubOrg] = useState<TSubOrganization | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "addSubOrg",
    "editSubOrg",
    "deleteSubOrg"
  ] as const);

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination(SubOrgOrderBy.Name, {
    initPerPage: getUserTablePreference("subOrgsTable", PreferenceKey.PerPage, 24)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("subOrgsTable", PreferenceKey.PerPage, newPerPage);
  };

  const orderDir = orderDirection === OrderByDirection.ASC ? "asc" : "desc";

  const { data: allSubOrgsData, isPending: isLoading } = useQuery(
    subOrganizationsQuery.list({
      search: debouncedSearch || undefined,
      orderBy: "name",
      orderDirection: orderDir,
      limit,
      offset
    })
  );

  // Used only to determine isMember flag; unaffected by search/pagination.
  const { data: mySubOrgIds = new Set<string>() } = useQuery({
    ...subOrganizationsQuery.list({ limit: 500, isAccessible: true }),
    select: (data) => new Set(data.organizations.map((o) => o.id))
  });

  const totalCount = allSubOrgsData?.totalCount ?? 0;
  const paginatedSubOrgs: SubOrgWithMember[] = (allSubOrgsData?.organizations ?? []).map((o) => ({
    ...o,
    isMember: mySubOrgIds.has(o.id)
  }));

  const { mutateAsync: updateSubOrg, isPending: isUpdating } = useUpdateSubOrganization();
  const { mutateAsync: deleteSubOrg } = useDeleteSubOrganization();
  const { mutateAsync: joinSubOrg, isPending: isJoining } = useJoinSubOrganization();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<EditSubOrgFormData>({
    resolver: zodResolver(editSubOrgSchema)
  });

  useResetPageHelper({ setPage, offset, totalCount });

  const handleLoginSubOrg = async (subOrgId: string) => {
    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
      organizationId: subOrgId
    });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => async () => {
        await handleLoginSubOrg(subOrgId);
      });
      return;
    }

    SecurityClient.setToken(token);
    SecurityClient.setProviderAuthToken("");
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
    await queryClient.refetchQueries({ queryKey: authKeys.getAuthToken });
    await navigateUserToOrg({ navigate, organizationId: subOrgId });
  };

  const handleOpenEditModal = (subOrg: TSubOrganization) => {
    setSelectedSubOrg(subOrg);
    reset({ name: subOrg.name, slug: subOrg.slug });
    handlePopUpOpen("editSubOrg");
  };

  const handleOpenDeleteModal = (subOrg: TSubOrganization) => {
    setSelectedSubOrg(subOrg);
    handlePopUpOpen("deleteSubOrg");
  };

  const handleEditSubmit = async (data: EditSubOrgFormData) => {
    if (!selectedSubOrg) return;
    try {
      await updateSubOrg({
        subOrgId: selectedSubOrg.id,
        name: data.name,
        slug: data.slug || undefined
      });
      handlePopUpClose("editSubOrg");
      createNotification({ type: "success", text: "Sub-organization updated successfully" });
    } catch {
      createNotification({ type: "error", text: "Failed to update sub-organization" });
    }
  };

  const handleDeleteApproved = async () => {
    if (!selectedSubOrg) return;
    try {
      await deleteSubOrg({ subOrgId: selectedSubOrg.id });
      handlePopUpClose("deleteSubOrg");
      createNotification({ type: "success", text: "Sub-organization deleted successfully" });
    } catch {
      createNotification({ type: "error", text: "Failed to delete sub-organization" });
    }
  };

  const renderActions = (subOrg: SubOrgWithMember) => {
    if (subOrg.isMember) {
      return canManageSubOrgs ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton ariaLabel="options" colorSchema="secondary" variant="plain" className="w-6">
              <FontAwesomeIcon icon={faEllipsisV} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} align="end">
            {canEditSubOrg && (
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faPen} />}
                onClick={() => handleOpenEditModal(subOrg)}
              >
                Edit
              </DropdownMenuItem>
            )}
            {canDeleteSubOrg && (
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faTrash} />}
                onClick={() => handleOpenDeleteModal(subOrg)}
                className="text-red-600 hover:text-red-500"
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null;
    }

    if (!canDirectAccess) return null;

    return (
      <Button
        size="xs"
        variant="outline_bg"
        isDisabled={isJoining}
        onClick={() => joinSubOrg({ subOrgId: subOrg.id })}
      >
        Join
      </Button>
    );
  };

  const renderListItem = (subOrg: SubOrgWithMember, index: number) => (
    <div
      key={subOrg.id}
      role="button"
      tabIndex={0}
      className={`group flex min-w-72 border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 hover:bg-mineshaft-700 ${
        index === 0 ? "rounded-t-md" : ""
      } ${subOrg.isMember ? "cursor-pointer" : ""}`}
      onClick={() => {
        if (subOrg.isMember)
          handleLoginSubOrg(subOrg.id).catch(() =>
            createNotification({ type: "error", text: "Failed to log in to sub-organization" })
          );
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && subOrg.isMember)
          handleLoginSubOrg(subOrg.id).catch(() =>
            createNotification({ type: "error", text: "Failed to log in to sub-organization" })
          );
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="-mt-0.5 flex min-w-0 flex-col">
          <p className="truncate text-sm text-mineshaft-100">{subOrg.name}</p>
          <p className="truncate text-xs text-mineshaft-400">
            Created {format(new Date(subOrg.createdAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>
      <div
        className="flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
        role="none"
      >
        {subOrg.isMember && (
          <Badge variant="info" className="mr-1">
            <CheckIcon />
            Joined
          </Badge>
        )}
        {renderActions(subOrg)}
      </div>
    </div>
  );

  let content;

  if (isLoading) {
    content = (
      <div className="mt-4 w-full rounded-md">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`sub-org-loading-${i + 1}`}
            className={`group flex h-12 min-w-72 flex-row items-center justify-between border border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700 ${
              i === 0 && "rounded-t-md"
            } ${i === 2 && "rounded-b-md border-b"}`}
          >
            <Skeleton className="w-full bg-mineshaft-600" />
          </div>
        ))}
      </div>
    );
  } else if (paginatedSubOrgs.length > 0) {
    content = (
      <div className="mt-4 w-full rounded-md">
        {paginatedSubOrgs.map((subOrg, index) => renderListItem(subOrg, index))}
      </div>
    );
  } else if (totalCount === 0 && searchFilter) {
    content = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No sub-orgs match search...</div>
      </div>
    );
  } else {
    content = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faFolderOpen}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">
          No sub-organizations found in this organization.
        </div>
      </div>
    );
  }

  if (shouldShowMfa) {
    return (
      <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Mfa
          email={user.email as string}
          method={requiredMfaMethod}
          successCallback={mfaSuccessCallback}
          closeMfa={() => toggleShowMfa.off()}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex w-full flex-row flex-wrap gap-2 md:flex-nowrap md:gap-0">
        <Input
          className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50/60 duration-200 focus:bg-mineshaft-700/80"
          containerClassName="w-full"
          placeholder="Search by name..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        />
        <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip content="Toggle Sort Direction">
            <IconButton
              className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
              ariaLabel={`Sort ${orderDirection === OrderByDirection.ASC ? "descending" : "ascending"}`}
              variant="plain"
              size="xs"
              colorSchema="secondary"
              onClick={toggleOrderDirection}
            >
              <FontAwesomeIcon
                icon={orderDirection === OrderByDirection.ASC ? faArrowDownAZ : faArrowUpZA}
              />
            </IconButton>
          </Tooltip>
        </div>
        {canCreateSubOrg && (
          <Button
            colorSchema="secondary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => handlePopUpOpen("addSubOrg")}
            className="ml-2"
          >
            Add Sub Org
          </Button>
        )}
      </div>

      {content}

      {!isLoading && totalCount > 0 && (
        <Pagination
          className="rounded-b-md border border-mineshaft-600"
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={totalCount}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}

      <Modal
        isOpen={popUp.addSubOrg.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSubOrg", isOpen)}
      >
        <ModalContent
          title="Add Sub Org"
          subTitle="Create a new sub-organization under this organization."
        >
          <NewSubOrganizationForm
            onClose={() => handlePopUpClose("addSubOrg")}
            handleOrgSelection={() => handlePopUpClose("addSubOrg")}
          />
        </ModalContent>
      </Modal>

      <Modal
        isOpen={popUp.editSubOrg.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSubOrg", isOpen)}
      >
        <ModalContent
          title="Edit Sub-Org"
          subTitle="Update the name and slug of this sub-organization."
          footerContent={
            <div className="flex items-center gap-2">
              <Button
                colorSchema="secondary"
                type="submit"
                form="edit-sub-org-form"
                isLoading={isUpdating}
              >
                Save Changes
              </Button>
              <Button
                variant="plain"
                colorSchema="secondary"
                onClick={() => handlePopUpClose("editSubOrg")}
              >
                Cancel
              </Button>
            </div>
          }
        >
          <form id="edit-sub-org-form" onSubmit={handleSubmit(handleEditSubmit)}>
            <FormControl
              label="Name"
              isError={Boolean(errors.name)}
              errorText={errors.name?.message}
            >
              <Input {...register("name")} placeholder="My Sub-Organization" />
            </FormControl>
            <FormControl
              label="Slug"
              isError={Boolean(errors.slug)}
              errorText={errors.slug?.message}
              isOptional
            >
              <Input {...register("slug")} placeholder="my-sub-organization" />
            </FormControl>
          </form>
        </ModalContent>
      </Modal>

      <DeleteActionModal
        isOpen={popUp.deleteSubOrg.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteSubOrg", isOpen)}
        title="Are you sure you want to delete this sub-organization?"
        subTitle={`Permanently remove ${selectedSubOrg?.name} and all of its data. This action is not reversible, so please be careful.`}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteApproved}
      />
    </div>
  );
};
