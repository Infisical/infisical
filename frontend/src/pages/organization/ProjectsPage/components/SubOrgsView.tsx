import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  faArrowDownAZ,
  faArrowUpZA,
  faBorderAll,
  faEllipsisV,
  faFolderOpen,
  faList,
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
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  OrgPermissionActions,
  OrgPermissionSubOrgActions
} from "@app/context/OrgPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
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

enum SubOrgsViewMode {
  GRID = "grid",
  LIST = "list"
}

enum SubOrgOrderBy {
  Name = "name"
}

export enum SubOrgListView {
  MySubOrgs = "my-sub-orgs",
  AllSubOrgs = "all-sub-orgs"
}

const editSubOrgSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().optional()
});

type EditSubOrgFormData = z.infer<typeof editSubOrgSchema>;

type SubOrgWithMember = TSubOrganization & { isMember: boolean };

export const SubOrgsView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permission } = useOrgPermission();

  const canEditSubOrg = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const canDeleteSubOrg = permission.can(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.Settings
  );
  const canManageSubOrgs = canEditSubOrg || canDeleteSubOrg;
  const hasDirectAccess = permission.can(
    OrgPermissionSubOrgActions.DirectAccess,
    OrgPermissionSubjects.SubOrganization
  );

  const [viewMode, setViewMode] = useState<SubOrgsViewMode>(
    (localStorage.getItem("subOrgsViewMode") as SubOrgsViewMode) || SubOrgsViewMode.GRID
  );
  const [listView, setListView] = useState<SubOrgListView>(SubOrgListView.MySubOrgs);
  const effectiveListView = hasDirectAccess ? listView : SubOrgListView.AllSubOrgs;
  const [searchFilter, setSearchFilter] = useState("");
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

  const { data: allSubOrgs = [], isPending: isAllLoading } = useQuery(
    subOrganizationsQuery.list({ limit: 500 })
  );

  const { data: mySubOrgs = [], isPending: isMyLoading } = useQuery(
    subOrganizationsQuery.list({ limit: 500, isAccessible: true })
  );

  const isLoading = isAllLoading || isMyLoading;

  const mySubOrgIds = new Set(mySubOrgs.map((o) => o.id));

  const subOrgsWithMember: SubOrgWithMember[] =
    !hasDirectAccess || effectiveListView === SubOrgListView.MySubOrgs
      ? mySubOrgs.map((o) => ({ ...o, isMember: true }))
      : allSubOrgs.map((o) => ({ ...o, isMember: mySubOrgIds.has(o.id) }));

  const { mutateAsync: updateSubOrg, isPending: isUpdating } = useUpdateSubOrganization();
  const { mutateAsync: deleteSubOrg } = useDeleteSubOrganization();
  const { mutateAsync: joinSubOrg } = useJoinSubOrganization();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<EditSubOrgFormData>({
    resolver: zodResolver(editSubOrgSchema)
  });

  const filteredSubOrgs = subOrgsWithMember
    .filter((org) => org.name.toLowerCase().includes(searchFilter.toLowerCase()))
    .sort((a, b) =>
      orderDirection === OrderByDirection.ASC
        ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
    );

  useResetPageHelper({ setPage, offset, totalCount: filteredSubOrgs.length });

  const paginatedSubOrgs = filteredSubOrgs.slice(offset, limit * page);

  const handleLoginSubOrg = async (subOrgId: string) => {
    const { token, isMfaEnabled } = await selectOrganization({ organizationId: subOrgId });
    if (isMfaEnabled) return;
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
    await updateSubOrg({
      subOrgId: selectedSubOrg.id,
      name: data.name,
      slug: data.slug || undefined
    });
    handlePopUpClose("editSubOrg");
  };

  const handleDeleteApproved = async () => {
    if (!selectedSubOrg) return;
    await deleteSubOrg({ subOrgId: selectedSubOrg.id });
    handlePopUpClose("deleteSubOrg");
  };

  const renderMemberActions = (subOrg: TSubOrganization) =>
    canManageSubOrgs ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="options"
              colorSchema="secondary"
              variant="plain"
              className="w-6"
            >
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

  const renderNonMemberActions = (subOrg: SubOrgWithMember) => {
    if (!hasDirectAccess) return null;
    return (
      <Button size="xs" variant="outline_bg" onClick={() => joinSubOrg({ subOrgId: subOrg.id })}>
        Join
      </Button>
    );
  };

  const renderGridItem = (subOrg: SubOrgWithMember) => (
    <div
      key={subOrg.id}
      role="button"
      tabIndex={0}
      className={`overflow-clip rounded-sm border border-l-4 border-mineshaft-600 border-l-mineshaft-400 bg-mineshaft-800 p-4 transition-transform duration-100 hover:border-l-primary hover:bg-mineshaft-700 ${subOrg.isMember ? "cursor-pointer" : ""}`}
      onClick={() => {
        if (subOrg.isMember) handleLoginSubOrg(subOrg.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && subOrg.isMember) handleLoginSubOrg(subOrg.id);
      }}
    >
      <div className="flex items-center gap-4">
        <p className="min-w-0 flex-1 truncate text-lg font-medium text-mineshaft-100">
          {subOrg.name}
        </p>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          role="none"
        >
          {subOrg.isMember ? (
            <>
              {hasDirectAccess && effectiveListView === SubOrgListView.AllSubOrgs && (
                <Badge variant="info" className="mr-1">
                  <CheckIcon />
                  Joined
                </Badge>
              )}
              {renderMemberActions(subOrg)}
            </>
          ) : (
            renderNonMemberActions(subOrg)
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-mineshaft-400">
        Created {format(new Date(subOrg.createdAt), "MMM d, yyyy")}
      </p>
    </div>
  );

  const renderListItem = (subOrg: SubOrgWithMember, index: number) => (
    <div
      key={subOrg.id}
      role="button"
      tabIndex={0}
      className={`group flex min-w-72 border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 hover:bg-mineshaft-700 ${
        index === 0 ? "rounded-t-md" : ""
      } ${subOrg.isMember ? "cursor-pointer" : ""}`}
      onClick={() => {
        if (subOrg.isMember) handleLoginSubOrg(subOrg.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && subOrg.isMember) handleLoginSubOrg(subOrg.id);
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
        {subOrg.isMember ? (
          <>
            {hasDirectAccess && effectiveListView === SubOrgListView.AllSubOrgs && (
              <Badge variant="info" className="mr-1">
                <CheckIcon />
                Joined
              </Badge>
            )}
            {renderMemberActions(subOrg)}
          </>
        ) : (
          renderNonMemberActions(subOrg)
        )}
      </div>
    </div>
  );

  let content;

  if (isLoading) {
    content =
      viewMode === SubOrgsViewMode.GRID ? (
        <div className="mt-4 grid w-full grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`sub-org-loading-${i + 1}`}
              className="flex h-40 min-w-72 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
            >
              <Skeleton className="w-3/4 bg-mineshaft-600" />
              <Skeleton className="w-1/2 bg-mineshaft-600" />
              <div className="flex justify-end">
                <Skeleton className="w-1/2 bg-mineshaft-600" />
              </div>
            </div>
          ))}
        </div>
      ) : (
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
    content =
      viewMode === SubOrgsViewMode.GRID ? (
        <div className="mt-4 grid w-full grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {paginatedSubOrgs.map(renderGridItem)}
        </div>
      ) : (
        <div className="mt-4 w-full rounded-md">
          {paginatedSubOrgs.map((subOrg, index) => renderListItem(subOrg, index))}
        </div>
      );
  } else if (filteredSubOrgs.length === 0 && searchFilter) {
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
          {effectiveListView === SubOrgListView.MySubOrgs
            ? "You are not a member of any sub-organizations yet."
            : "No sub-organizations found in this organization."}
        </div>
        {effectiveListView === SubOrgListView.MySubOrgs && (
          <div className="mt-0.5 text-center font-light">
            Create a sub-org using the button above, or ask an admin to add you.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex w-full flex-row flex-wrap gap-2 md:flex-nowrap md:gap-0">
        {hasDirectAccess && (
          <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            <Button
              variant="outline_bg"
              size="xs"
              onClick={() => setListView(SubOrgListView.MySubOrgs)}
              className={`${
                listView === SubOrgListView.MySubOrgs ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-[5rem] border-none hover:bg-mineshaft-600`}
            >
              My Sub Orgs
            </Button>
            <Button
              variant="outline_bg"
              size="xs"
              onClick={() => setListView(SubOrgListView.AllSubOrgs)}
              className={`${
                listView === SubOrgListView.AllSubOrgs ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-[5rem] border-none hover:bg-mineshaft-600`}
            >
              All Sub Orgs
            </Button>
          </div>
        )}
        <Input
          className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50/60 duration-200 focus:bg-mineshaft-700/80"
          containerClassName="w-full ml-2"
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
        <div className="ml-2 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <IconButton
            variant="outline_bg"
            onClick={() => {
              localStorage.setItem("subOrgsViewMode", SubOrgsViewMode.GRID);
              setViewMode(SubOrgsViewMode.GRID);
            }}
            ariaLabel="grid"
            size="xs"
            className={`${
              viewMode === SubOrgsViewMode.GRID ? "bg-mineshaft-500" : "bg-transparent"
            } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
          >
            <FontAwesomeIcon icon={faBorderAll} />
          </IconButton>
          <IconButton
            variant="outline_bg"
            onClick={() => {
              localStorage.setItem("subOrgsViewMode", SubOrgsViewMode.LIST);
              setViewMode(SubOrgsViewMode.LIST);
            }}
            ariaLabel="list"
            size="xs"
            className={`${
              viewMode === SubOrgsViewMode.LIST ? "bg-mineshaft-500" : "bg-transparent"
            } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
          >
            <FontAwesomeIcon icon={faList} />
          </IconButton>
        </div>
        <Button
          colorSchema="secondary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => handlePopUpOpen("addSubOrg")}
          className="ml-2"
        >
          Add Sub Org
        </Button>
      </div>

      {content}

      {!isLoading && filteredSubOrgs.length > 0 && (
        <Pagination
          className={
            viewMode === SubOrgsViewMode.GRID
              ? "col-span-full justify-start! border-transparent bg-transparent pl-2"
              : "rounded-b-md border border-mineshaft-600"
          }
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={filteredSubOrgs.length}
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
