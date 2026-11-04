import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TriangleAlertIcon,
  UsersIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ManageAccessSheet } from "@app/components/agent-vault/ManageAccessSheet";
import { ServiceIconStack } from "@app/components/agent-vault/ServiceIconStack";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
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
  PageHeader,
  Pagination,
  RowLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { nameList } from "@app/helpers/string";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useListAgentVaultAccessBundles,
  useListAgentVaultAccessBundlesRequiringSetup
} from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundleListItem } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";
import { DeleteAccessBundleDialog } from "./components/DeleteAccessBundleDialog";

enum SortColumn {
  Name = "name",
  Services = "serviceCount",
  Created = "createdAt"
}

export const AgentVaultAccessBundlesPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sortColumn, setSortColumn] = useState(SortColumn.Created);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultAccessBundlesTable", PreferenceKey.PerPage, 20)
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  useAgentVaultCreateIntent(() => setIsCreateOpen(true), isAdmin);
  const [bundleToEdit, setBundleToEdit] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [bundleToDelete, setBundleToDelete] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );
  const [bundleToManage, setBundleToManage] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );

  const { data, isPending } = useListAgentVaultAccessBundles({
    search: debouncedSearch.trim() || undefined,
    orderBy: sortColumn,
    orderDirection: sortDirection === "ascending" ? "asc" : "desc",
    limit: perPage,
    offset: (page - 1) * perPage
  });

  const displayedBundles = data?.accessBundles ?? [];

  // From its own query rather than the page shown, so a bundle on a later page is still called out.
  const { data: requiringSetup } = useListAgentVaultAccessBundlesRequiringSetup();
  const bundlesNeedingSetup = requiringSetup?.accessBundles ?? [];
  // The query loads at most a page of them; the count comes from the server.
  const bundlesNeedingSetupCount = requiringSetup?.totalCount ?? 0;
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    setPage(1);
    if (direction === "none") {
      setSortColumn(SortColumn.Created);
      setSortDirection("descending");
      return;
    }

    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: SortColumn) =>
    twMerge(
      "transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const isFiltered = Boolean(debouncedSearch.trim());

  let emptyTitle: string;
  let emptyDescription: string;
  if (isFiltered) {
    emptyTitle = "No access bundles match your search";
    emptyDescription = "Try a different search term.";
  } else if (isAdmin) {
    emptyTitle = "No access bundles yet";
    emptyDescription = "Create one to group the services an agent can reach.";
  } else {
    emptyTitle = "No access bundles available";
    emptyDescription = "Ask an admin to grant you an access bundle.";
  }

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Access Bundles" />
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={PackageIcon}
        title="Access Bundles"
        description="Group the services an agent can reach through a session."
      />

      {bundlesNeedingSetup.length > 0 && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>
              {bundlesNeedingSetupCount === 1
                ? `${bundlesNeedingSetup[0].name} has services that require your personal values.`
                : `${bundlesNeedingSetupCount} access bundles have services that require your personal values.`}{" "}
              Sessions can&apos;t reach those services until you set them up.
            </p>
            <AlertAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
                    params: { orgId: currentOrg.id, accessBundleId: bundlesNeedingSetup[0].id }
                  })
                }
              >
                Open {bundlesNeedingSetup[0].name}
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Access Bundles
            <DocumentationLinkBadge href={AgentVaultDocsUrls.accessBundles} />
          </CardTitle>
          <CardDescription>
            Each bundle holds the services an agent can reach and the members who can create
            sessions with it.
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <Button variant="av" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon />
                Create Access Bundle
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search access bundles..."
            />
          </InputGroup>
        </CardContent>

        {!isPending && displayedBundles.length === 0 ? (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
              {!isFiltered && isAdmin && (
                <Button variant="av" onClick={() => setIsCreateOpen(true)}>
                  <PlusIcon />
                  Create Access Bundle
                </Button>
              )}
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  isTruncatable
                  className="w-2/5"
                  sortDirection={sortColumn === SortColumn.Name ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Name, direction)}
                >
                  Name
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Name)} />
                </TableHead>
                <TableHead
                  sortDirection={sortColumn === SortColumn.Services ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Services, direction)}
                >
                  Services
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Services)} />
                </TableHead>
                <TableHead>Members</TableHead>
                <TableHead
                  sortDirection={sortColumn === SortColumn.Created ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Created, direction)}
                >
                  Created
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Created)} />
                </TableHead>
                <TableHead className="w-0" />
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 3 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={`bundle-skeleton-${index}`}>
                    {Array.from({ length: 4 }).map((__, cell) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableCell key={`bundle-skeleton-${index}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                displayedBundles.map((bundle) => (
                  <TableRow key={bundle.id} linked>
                    <TableCell isTruncatable className="min-w-64">
                      <RowLink
                        to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                        params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
                        className="flex items-center gap-2.5"
                      >
                        <span className="truncate" title={bundle.name} data-row-interactive>
                          {bundle.name}
                        </span>
                        {bundle.description && (
                          <span
                            className="min-w-0 flex-1 truncate text-sm text-muted"
                            title={bundle.description}
                            data-row-interactive
                          >
                            {bundle.description}
                          </span>
                        )}
                      </RowLink>
                    </TableCell>
                    <TableCell>
                      <ServiceIconStack hostPatterns={bundle.hostPatterns} />
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="cursor-pointer underline decoration-muted underline-offset-2 hover:decoration-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            setBundleToManage(bundle);
                          }}
                        >
                          {bundle.memberCount} member{bundle.memberCount === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <>
                          {bundle.memberCount} member{bundle.memberCount === 1 ? "" : "s"}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm">
                            {format(new Date(bundle.createdAt), "MMM d, yyyy")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(bundle.createdAt), "MMM d, yyyy h:mm a")}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        {bundle.servicesRequiringSetup.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="warning" data-row-interactive>
                                <TriangleAlertIcon />
                                Requires Setup
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Your personal values are missing for{" "}
                              {nameList(
                                bundle.servicesRequiringSetup.map((service) => service.name)
                              )}
                              .
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell variant="action">
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label="Open access bundle actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                setBundleToManage(bundle);
                              }}
                            >
                              <UsersIcon />
                              Manage Access
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                setBundleToEdit(bundle);
                              }}
                            >
                              <PencilIcon />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                setBundleToDelete(bundle);
                              }}
                            >
                              <TrashIcon />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}

        {totalCount > 0 && (
          <CardContent className="-mt-5 pt-0">
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
                setUserTablePreference(
                  "agentVaultAccessBundlesTable",
                  PreferenceKey.PerPage,
                  newPerPage
                );
              }}
            />
          </CardContent>
        )}
      </Card>

      <AccessBundleFormDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(accessBundle) =>
          navigate({
            to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
            params: { orgId: currentOrg.id, accessBundleId: accessBundle.id }
          })
        }
      />
      <AccessBundleFormDialog
        isOpen={Boolean(bundleToEdit)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setBundleToEdit(null);
        }}
        accessBundle={bundleToEdit ?? undefined}
      />
      <ManageAccessSheet
        accessBundle={bundleToManage}
        onOpenChange={(isOpen) => {
          if (!isOpen) setBundleToManage(null);
        }}
      />

      <DeleteAccessBundleDialog
        accessBundle={bundleToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setBundleToDelete(null);
        }}
      />
    </div>
  );
};
