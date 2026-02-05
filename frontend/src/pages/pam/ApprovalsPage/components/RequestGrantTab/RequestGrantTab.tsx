import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  faCheckCircle,
  faChevronRight,
  faEllipsisV,
  faFileCircleQuestion,
  faFilter,
  faInfo,
  faMagnifyingGlass,
  faSearch,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  TextArea,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { getUserTablePreference, PreferenceKey } from "@app/helpers/userTablePreferences";
import { usePagination } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  approvalGrantQuery,
  ApprovalGrantStatus,
  useRevokeApprovalGrant
} from "@app/hooks/api/approvalGrants";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";

const revokeGrantSchema = z.object({
  revocationReason: z.string().max(256).optional()
});

type TRevokeGrantForm = z.infer<typeof revokeGrantSchema>;

const getStatusBadgeColor = (status: ApprovalGrantStatus) => {
  switch (status) {
    case ApprovalGrantStatus.Active:
      return "success";
    case ApprovalGrantStatus.Expired:
      return "neutral";
    case ApprovalGrantStatus.Revoked:
      return "danger";
    default:
      return "neutral";
  }
};

export const RequestGrantTab = () => {
  const { currentProject } = useProject();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ApprovalGrantStatus.Active);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [grantToRevoke, setGrantToRevoke] = useState<string | null>(null);
  const { data: members = [] } = useGetWorkspaceUsers(currentProject.id);

  const projectId = currentProject?.id || "";

  const { data: grants = [], isPending: isGrantsLoading } = useQuery(
    approvalGrantQuery.list({
      policyType: ApprovalPolicyType.PamAccess,
      projectId
    })
  );

  const { mutateAsync: revokeGrant, isPending: isRevoking } = useRevokeApprovalGrant();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<TRevokeGrantForm>({
    resolver: zodResolver(revokeGrantSchema)
  });

  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: getUserTablePreference("pamApprovalGrants", PreferenceKey.PerPage, 20)
  });

  const filteredGrants = useMemo(() => {
    let filtered = grants;

    // Apply search filter
    if (search) {
      filtered = filtered.filter((grant) => {
        if (grant.type !== ApprovalPolicyType.PamAccess) return false;
        const searchLower = search.toLowerCase();
        return (
          grant.attributes.accountPath?.toLowerCase().includes(searchLower) ||
          grant.attributes.resourceName?.toLowerCase().includes(searchLower) ||
          grant.attributes.accountName?.toLowerCase().includes(searchLower) ||
          grant.id.toLowerCase().includes(searchLower)
        );
      });
    }

    return filtered.filter((grant) => grant.status === filter);
  }, [grants, search, filter]);

  const paginatedGrants = useMemo(
    () => filteredGrants.slice(offset, offset + perPage),
    [filteredGrants, offset, perPage]
  );

  const openRevokeModal = (grantId: string) => {
    setGrantToRevoke(grantId);
    setRevokeModalOpen(true);
  };

  const closeRevokeModal = () => {
    setRevokeModalOpen(false);
    setGrantToRevoke(null);
    reset();
  };

  const getGrantedUser = (grantedUserId: string) => {
    const member = members?.find((m) => m.user.id === grantedUserId);
    if (member) {
      return getMemberLabel(member);
    }
    return grantedUserId;
  };

  const handleRevokeGrant = async (data: TRevokeGrantForm) => {
    if (!grantToRevoke) return;

    try {
      await revokeGrant({
        policyType: ApprovalPolicyType.PamAccess,
        grantId: grantToRevoke,
        revocationReason: data.revocationReason
      });

      createNotification({
        text: "Grant revoked successfully",
        type: "success"
      });

      closeRevokeModal();
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to revoke grant",
        type: "error"
      });
    }
  };

  const isTableFiltered = filter !== ApprovalGrantStatus.Active;

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">Access Grants</p>
        </div>
        <p className="text-sm text-bunker-300">View and revoke access grants to PAM accounts</p>
      </div>
      <div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Filter Grants"
                variant="plain"
                size="sm"
                className={twMerge(
                  "flex h-9.5 w-[2.6rem] items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                  isTableFiltered && "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-0">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(evt) => {
                  evt.preventDefault();
                  setFilter(ApprovalGrantStatus.Active);
                }}
                icon={
                  filter === ApprovalGrantStatus.Active && <FontAwesomeIcon icon={faCheckCircle} />
                }
                iconPos="right"
              >
                Active Grants
              </DropdownMenuItem>
              <DropdownSubMenu>
                <DropdownSubMenuTrigger
                  iconPos="right"
                  icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
                >
                  Inactive Grants
                </DropdownSubMenuTrigger>
                <DropdownSubMenuContent className="max-h-80 thin-scrollbar overflow-y-auto rounded-l-none">
                  <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                    Filter by Status
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      setFilter(ApprovalGrantStatus.Expired);
                    }}
                    icon={
                      filter === ApprovalGrantStatus.Expired && (
                        <FontAwesomeIcon icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    Expired
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      setFilter(ApprovalGrantStatus.Revoked);
                    }}
                    icon={
                      filter === ApprovalGrantStatus.Revoked && (
                        <FontAwesomeIcon icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    Revoked
                  </DropdownMenuItem>
                </DropdownSubMenuContent>
              </DropdownSubMenu>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search access grants..."
          />
        </div>
        <TableContainer className="mt-4">
          <Table>
            <THead>
              <Tr>
                <Th>User</Th>
                <Th>Account</Th>
                <Th>Access Duration</Th>
                <Th>Status</Th>
                <Th>Granted</Th>
                <Th>Expires</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isGrantsLoading && <TableSkeleton columns={7} innerKey="access-grants" />}
              {!isGrantsLoading &&
                paginatedGrants.map((grant) => {
                  if (grant.type !== ApprovalPolicyType.PamAccess) return null;
                  const isActive = grant.status === ApprovalGrantStatus.Active;

                  return (
                    <Tr key={grant.id} className="group">
                      <Td>
                        {grant.granteeUserId ? getGrantedUser(grant.granteeUserId) : "Unknown"}
                      </Td>
                      <Td>
                        <div className="space-y-0.5">
                          {grant.attributes.resourceName && (
                            <div className="text-sm text-mineshaft-200">
                              <span className="text-mineshaft-400">Resource:</span>{" "}
                              {grant.attributes.resourceName}
                            </div>
                          )}
                          {grant.attributes.accountName && (
                            <div className="text-sm text-mineshaft-200">
                              <span className="text-mineshaft-400">Account:</span>{" "}
                              {grant.attributes.accountName}
                            </div>
                          )}
                          {grant.attributes.accountPath &&
                            !grant.attributes.resourceName &&
                            !grant.attributes.accountName && (
                              <div className="text-sm text-mineshaft-200">
                                <span className="text-mineshaft-400">Path:</span>{" "}
                                {grant.attributes.accountPath}
                              </div>
                            )}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-sm text-mineshaft-200">
                          {grant.attributes.accessDuration}
                        </span>
                      </Td>
                      <Td>
                        <Badge
                          variant={
                            isActive
                              ? getStatusBadgeColor(ApprovalGrantStatus.Active)
                              : getStatusBadgeColor(grant.status)
                          }
                          className="capitalize"
                        >
                          {isActive ? "Active" : grant.status}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-sm text-mineshaft-400">
                          {formatDistance(new Date(grant.createdAt), new Date(), {
                            addSuffix: true
                          })}
                        </span>
                      </Td>
                      <Td>
                        {grant.expiresAt ? (
                          <span className="text-sm text-mineshaft-400">
                            {formatDistance(new Date(grant.expiresAt), new Date(), {
                              addSuffix: true
                            })}
                          </span>
                        ) : (
                          <span className="text-sm text-mineshaft-500">Never</span>
                        )}
                      </Td>
                      <Td
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {isActive && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild className="rounded-lg">
                              <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                <Tooltip content="More options">
                                  <IconButton
                                    ariaLabel="More options"
                                    variant="plain"
                                    className="w-4 p-0"
                                    size="md"
                                  >
                                    <FontAwesomeIcon icon={faEllipsisV} />
                                  </IconButton>
                                </Tooltip>
                              </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="p-1" sideOffset={5}>
                              <Link
                                to="/organizations/$orgId/projects/pam/$projectId/approval-requests/$approvalRequestId"
                                params={{
                                  orgId: currentProject.orgId,
                                  projectId: currentProject.id,
                                  approvalRequestId: grant.requestId || ""
                                }}
                              >
                                <DropdownMenuItem icon={<FontAwesomeIcon icon={faInfo} />}>
                                  Request Details
                                </DropdownMenuItem>
                              </Link>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRevokeModal(grant.id);
                                }}
                                icon={<FontAwesomeIcon icon={faXmark} />}
                              >
                                Revoke Grant
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {Boolean(filteredGrants.length) && (
            <Pagination
              count={filteredGrants.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          )}
          {!isGrantsLoading && !filteredGrants?.length && (
            <EmptyState
              title={grants.length ? "No access grants match search..." : "No access grants found"}
              icon={grants.length ? faSearch : faFileCircleQuestion}
            />
          )}
        </TableContainer>

        <Modal isOpen={revokeModalOpen} onOpenChange={(open) => !open && closeRevokeModal()}>
          <ModalContent
            title="Revoke Access Grant"
            subTitle="Are you sure you want to revoke this access grant? This action cannot be undone."
          >
            <form onSubmit={handleSubmit(handleRevokeGrant)}>
              <FormControl
                label="Revocation Reason (Optional)"
                isError={Boolean(errors.revocationReason)}
                errorText={errors.revocationReason?.message}
              >
                <TextArea
                  {...register("revocationReason")}
                  placeholder="Provide a reason for revoking this grant..."
                  rows={4}
                />
              </FormControl>
              <div className="mt-6 flex items-center space-x-4">
                <Button
                  colorSchema="danger"
                  type="submit"
                  isLoading={isRevoking}
                  isDisabled={isRevoking}
                >
                  Revoke Grant
                </Button>
                <Button variant="outline_bg" onClick={closeRevokeModal} isDisabled={isRevoking}>
                  Cancel
                </Button>
              </div>
            </form>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
};
