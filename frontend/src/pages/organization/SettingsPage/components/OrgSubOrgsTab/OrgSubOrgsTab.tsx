import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CheckIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { DeleteActionModal, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
  SubOrgOrderBy,
  TSubOrganization,
  useDeleteSubOrganization,
  useJoinSubOrganization,
  useUpdateSubOrganization
} from "@app/hooks/api/subOrganizations";
import { usePopUp } from "@app/hooks/usePopUp";
import { NewSubOrganizationForm } from "@app/layouts/OrganizationLayout/components/NavBar/NewSubOrganizationForm";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

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

  const canManageSubOrgs =
    permission.can(OrgPermissionSubOrgActions.Edit, OrgPermissionSubjects.SubOrganization) ||
    permission.can(OrgPermissionSubOrgActions.Delete, OrgPermissionSubjects.SubOrganization);

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
    initPerPage: getUserTablePreference("subOrgsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("subOrgsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: allSubOrgsData, isPending: isLoading } = useQuery(
    subOrganizationsQuery.list({
      search: debouncedSearch || undefined,
      orderBy: SubOrgOrderBy.Name,
      orderDirection,
      limit,
      offset
    })
  );

  const { data: mySubOrgIds = new Set<string>() } = useQuery({
    ...subOrganizationsQuery.list({ isAccessible: true }),
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
    await updateSubOrg({
      subOrgId: selectedSubOrg.id,
      name: data.name,
      slug: data.slug || undefined
    });
    handlePopUpClose("editSubOrg");
    createNotification({ type: "success", text: "Sub-organization updated successfully" });
  };

  const handleDeleteApproved = async () => {
    if (!selectedSubOrg) return;
    await deleteSubOrg({ subOrgId: selectedSubOrg.id });
    handlePopUpClose("deleteSubOrg");
    createNotification({ type: "success", text: "Sub-organization deleted successfully" });
  };

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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sub-Organizations</CardTitle>
          <CardDescription>Manage sub-organizations under this organization.</CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgPermissionSubOrgActions.Create}
              a={OrgPermissionSubjects.SubOrganization}
            >
              {(isAllowed) => (
                <Button
                  variant="org"
                  onClick={() => handlePopUpOpen("addSubOrg")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Sub Org
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search sub-organizations..."
              />
            </InputGroup>
          </div>
          {!isLoading && paginatedSubOrgs.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {searchFilter
                    ? "No sub-organizations match search"
                    : "No sub-organizations found"}
                </EmptyTitle>
                <EmptyDescription>
                  {searchFilter
                    ? "Adjust your search criteria."
                    : "Create a sub-organization to get started."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={toggleOrderDirection} className="w-1/3">
                      Name
                      <ChevronDownIcon
                        className={twMerge(
                          orderDirection === OrderByDirection.DESC && "rotate-180",
                          "transition-transform"
                        )}
                      />
                    </TableHead>
                    <TableHead className="w-1/4">Slug</TableHead>
                    <TableHead className="w-1/4">Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: perPage }).map((_, i) => (
                      <TableRow key={`skeleton-${i + 1}`}>
                        <TableCell>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-4" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!isLoading &&
                    paginatedSubOrgs.map((subOrg) => (
                      <TableRow
                        key={subOrg.id}
                        className="group"
                        onClick={
                          subOrg.isMember
                            ? () => {
                                handleLoginSubOrg(subOrg.id);
                              }
                            : undefined
                        }
                      >
                        <TableCell isTruncatable>{subOrg.name}</TableCell>
                        <TableCell isTruncatable className="text-muted">
                          {subOrg.slug}
                        </TableCell>
                        <TableCell>{format(new Date(subOrg.createdAt), "MMM d, yyyy")}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {subOrg.isMember ? (
                            <Badge variant="info">
                              <CheckIcon />
                              Joined
                            </Badge>
                          ) : (
                            <OrgPermissionCan
                              I={OrgPermissionSubOrgActions.DirectAccess}
                              a={OrgPermissionSubjects.SubOrganization}
                            >
                              {(isAllowed) =>
                                isAllowed ? (
                                  <Button
                                    size="xs"
                                    variant="org"
                                    isDisabled={isJoining}
                                    onClick={() => joinSubOrg({ subOrgId: subOrg.id })}
                                  >
                                    Join
                                  </Button>
                                ) : null
                              }
                            </OrgPermissionCan>
                          )}
                        </TableCell>
                        <TableCell>
                          {canManageSubOrgs && (
                            <div
                              className="flex items-center justify-end"
                              onClick={(e) => e.stopPropagation()}
                              role="none"
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton variant="ghost" size="xs">
                                    <MoreHorizontalIcon />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent sideOffset={2} align="end">
                                  <OrgPermissionCan
                                    I={OrgPermissionSubOrgActions.Edit}
                                    a={OrgPermissionSubjects.SubOrganization}
                                  >
                                    {(isAllowed) =>
                                      isAllowed ? (
                                        <DropdownMenuItem
                                          onClick={() => handleOpenEditModal(subOrg)}
                                        >
                                          <PencilIcon />
                                          Edit
                                        </DropdownMenuItem>
                                      ) : null
                                    }
                                  </OrgPermissionCan>
                                  <OrgPermissionCan
                                    I={OrgPermissionSubOrgActions.Delete}
                                    a={OrgPermissionSubjects.SubOrganization}
                                  >
                                    {(isAllowed) =>
                                      isAllowed ? (
                                        <DropdownMenuItem
                                          variant="danger"
                                          onClick={() => handleOpenDeleteModal(subOrg)}
                                        >
                                          <TrashIcon />
                                          Delete
                                        </DropdownMenuItem>
                                      ) : null
                                    }
                                  </OrgPermissionCan>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {Boolean(totalCount) && (
                <Pagination
                  count={totalCount}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

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
              <Button variant="org" type="submit" form="edit-sub-org-form" isPending={isUpdating}>
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => handlePopUpClose("editSubOrg")}>
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
    </>
  );
};
