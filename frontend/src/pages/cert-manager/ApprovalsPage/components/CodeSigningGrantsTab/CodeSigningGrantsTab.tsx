import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  FilterIcon,
  InfoIcon,
  MoreHorizontalIcon,
  SearchIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { FormControl, TextArea } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { useOrganization, useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { usePagination } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  approvalGrantQuery,
  ApprovalGrantStatus,
  CodeSigningGrantAttributes,
  useRevokeApprovalGrant
} from "@app/hooks/api/approvalGrants";
import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership/queries";

import { PkiDocsUrls } from "../../../pki-docs-urls";

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

export const CodeSigningGrantsTab = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ApprovalGrantStatus.Active);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [grantToRevoke, setGrantToRevoke] = useState<string | null>(null);
  const { data: members = [] } = useGetWorkspaceUsers(currentProject.id);
  const { data: identityMemberships } = useListProjectIdentityMemberships({
    projectId: currentProject.id
  });

  const projectId = currentProject?.id || "";

  const { data: grants = [], isPending: isGrantsLoading } = useQuery(
    approvalGrantQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      scope: ApprovalPolicyScope.Project,
      id: projectId
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
    initPerPage: 10
  });

  const getGrantedUser = (grantedUserId: string) => {
    const member = members?.find((m) => m.user.id === grantedUserId);
    if (member) {
      return getMemberLabel(member);
    }
    return grantedUserId;
  };

  const getGranteeName = (grant: {
    granteeUserId: string | null;
    granteeMachineIdentityId: string | null;
  }): string => {
    if (grant.granteeUserId) {
      return getGrantedUser(grant.granteeUserId);
    }
    if (grant.granteeMachineIdentityId) {
      const identity = identityMemberships?.identityMemberships?.find(
        (m) => m.identity.id === grant.granteeMachineIdentityId
      );
      return identity?.identity.name ?? grant.granteeMachineIdentityId;
    }
    return "Unknown";
  };

  const filteredGrants = useMemo(() => {
    let filtered = grants;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((grant) => {
        const attrs = grant.attributes as CodeSigningGrantAttributes;
        const granteeName = getGranteeName(grant).toLowerCase();
        return (
          attrs.signerName?.toLowerCase().includes(searchLower) ||
          granteeName.includes(searchLower) ||
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

  const handleRevokeGrant = async (data: TRevokeGrantForm) => {
    if (!grantToRevoke) return;

    try {
      await revokeGrant({
        policyType: ApprovalPolicyType.CertCodeSigning,
        grantId: grantToRevoke,
        revocationReason: data.revocationReason
      });

      createNotification({
        text: "Grant revoked successfully",
        type: "success"
      });

      closeRevokeModal();
    } catch {
      createNotification({
        text: "Failed to revoke grant",
        type: "error"
      });
    }
  };

  const isTableFiltered = filter !== ApprovalGrantStatus.Active;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Signing Grants
          <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.approvals.grantLifecycle} />
        </CardTitle>
        <CardDescription>View and revoke signing access grants.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search signing grants..."
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="Filter Grants"
                variant={isTableFiltered ? "project" : "outline"}
                size="md"
                className={twMerge(isTableFiltered && "text-primary")}
              >
                <FilterIcon className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(evt) => {
                  evt.preventDefault();
                  setFilter(ApprovalGrantStatus.Active);
                }}
              >
                Active Grants
                {filter === ApprovalGrantStatus.Active && (
                  <CircleCheckIcon className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  Inactive Grants
                  <ChevronRightIcon className="ml-auto size-4" />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      setFilter(ApprovalGrantStatus.Expired);
                    }}
                  >
                    Expired
                    {filter === ApprovalGrantStatus.Expired && (
                      <CircleCheckIcon className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      setFilter(ApprovalGrantStatus.Revoked);
                    }}
                  >
                    Revoked
                    {filter === ApprovalGrantStatus.Revoked && (
                      <CircleCheckIcon className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grantee</TableHead>
              <TableHead>Signer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isGrantsLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`cs-grant-skeleton-${i + 1}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={`cs-grant-skeleton-cell-${j + 1}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isGrantsLoading &&
              paginatedGrants.map((grant) => {
                const attrs = grant.attributes as CodeSigningGrantAttributes;
                const isActive = grant.status === ApprovalGrantStatus.Active;

                return (
                  <TableRow key={grant.id} className="group">
                    <TableCell isTruncatable>{getGranteeName(grant)}</TableCell>
                    <TableCell isTruncatable>{attrs.signerName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeColor(grant.status)} className="capitalize">
                        {isActive ? "Active" : grant.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-accent">
                      {format(new Date(grant.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-accent">
                      {grant.expiresAt ? format(new Date(grant.expiresAt), "MMM d, yyyy") : "Never"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isActive && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs" aria-label="Grant actions">
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-40" sideOffset={2}>
                            {grant.requestId && (
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/organizations/$orgId/projects/cert-manager/$projectId/approvals/$approvalRequestId"
                                  params={{
                                    orgId: currentOrg.id,
                                    projectId: currentProject.id,
                                    approvalRequestId: grant.requestId
                                  }}
                                  search={{ policyType: ApprovalPolicyType.CertCodeSigning }}
                                >
                                  <InfoIcon />
                                  Request Details
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRevokeModal(grant.id);
                              }}
                            >
                              <XIcon />
                              Revoke Grant
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {!isGrantsLoading && !filteredGrants.length && (
          <Empty className="border border-solid">
            <EmptyHeader>
              <EmptyTitle>
                {grants.length ? "No signing grants match search" : "No signing grants yet"}
              </EmptyTitle>
              <EmptyDescription>
                {grants.length
                  ? "Try clearing your filters or search."
                  : "Approved signing requests will appear here as active grants."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {Boolean(filteredGrants.length) && (
          <Pagination
            count={filteredGrants.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </CardContent>

      <Dialog open={revokeModalOpen} onOpenChange={(open) => !open && closeRevokeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="gap-3">
            <DialogTitle>Revoke Signing Grant</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this signing grant? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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
            <DialogFooter>
              <Button variant="outline" onClick={closeRevokeModal} isDisabled={isRevoking}>
                Cancel
              </Button>
              <Button variant="danger" type="submit" isPending={isRevoking} isDisabled={isRevoking}>
                Revoke Grant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
