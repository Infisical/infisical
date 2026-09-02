import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, MoreHorizontalIcon, PackageIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ConnectionIconStack } from "@app/components/agent-vault/ConnectionIconStack";
import { ManageAccessSheet } from "@app/components/agent-vault/ManageAccessSheet";
import {
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { useListAgentVaultAccessBundles } from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundleListItem } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";
import { DeleteAccessBundleDialog } from "./components/DeleteAccessBundleDialog";

enum SortColumn {
  Name = "name",
  Connections = "connections"
}

export const AgentVaultAccessBundlesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState(SortColumn.Name);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [bundleToEdit, setBundleToEdit] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [bundleToDelete, setBundleToDelete] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );
  const [bundleToManage, setBundleToManage] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );

  const { data: accessBundles, isPending } = useListAgentVaultAccessBundles();

  const displayedBundles = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (accessBundles ?? []).filter(
      (bundle) =>
        bundle.name.toLowerCase().includes(term) ||
        (bundle.description ?? "").toLowerCase().includes(term)
    );

    const ordered = [...filtered].sort((a, b) =>
      sortColumn === SortColumn.Connections
        ? a.connectionCount - b.connectionCount
        : a.name.localeCompare(b.name)
    );

    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [accessBundles, search, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    if (direction === "none") {
      setSortColumn(SortColumn.Name);
      setSortDirection("ascending");
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

  const isFiltered = Boolean(search.trim());

  let emptyTitle: string;
  let emptyDescription: string;
  if (isFiltered) {
    emptyTitle = "No access bundles match your search";
    emptyDescription = "Try a different search term.";
  } else if (isAdmin) {
    emptyTitle = "No access bundles yet";
    emptyDescription = "Create one to group the connections an agent may use.";
  } else {
    emptyTitle = "No access bundles available";
    emptyDescription = "Ask an Agent Vault admin to grant you an access bundle.";
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Access Bundles" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={PackageIcon}
        title="Access Bundles"
        description="What an agent can reach. Grant a bundle to a person, machine identity or group."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Access Bundles
            <DocumentationLinkBadge href={AgentVaultDocsUrls.accessBundles} />
          </CardTitle>
          <CardDescription>
            Each bundle holds the connections an agent may use and the members who can mint a
            session over it.
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <Button variant="av" onClick={() => setIsCreateOpen(true)}>
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search access bundles..."
            />
          </InputGroup>
        </CardContent>

        {!isPending && displayedBundles.length === 0 ? (
          <CardContent>
            <Empty className="border" frame="dashed">
              <EmptyHeader>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  sortDirection={sortColumn === SortColumn.Name ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Name, direction)}
                >
                  Name
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Name)} />
                </TableHead>
                <TableHead
                  sortDirection={sortColumn === SortColumn.Connections ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Connections, direction)}
                >
                  Connections
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Connections)} />
                </TableHead>
                <TableHead>Members</TableHead>
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
                  <TableRow
                    key={bundle.id}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
                        params: { orgId: currentOrg.id, accessBundleId: bundle.id }
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span>{bundle.name}</span>
                        {bundle.description && (
                          <span className="truncate text-sm text-muted">{bundle.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConnectionIconStack hostPatterns={bundle.hostPatterns} />
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
                              Manage Access
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                setBundleToEdit(bundle);
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                setBundleToDelete(bundle);
                              }}
                            >
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
      </Card>

      <AccessBundleFormDialog isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} />
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
