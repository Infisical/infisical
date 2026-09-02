import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon, PackageIcon, SearchIcon } from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import {
  Button,
  Card,
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
  OverflowBadgeList,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import { useListAgentVaultAccessBundles } from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundleListItem } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { DeleteAccessBundleDialog } from "./components/DeleteAccessBundleDialog";

enum SortOption {
  Name = "name",
  Connections = "connections"
}

// The connection labels are re-derived from the stored host patterns rather than persisted, so a
// bundle edited by hand still reads correctly.
const connectionLabels = (bundle: TAgentVaultAccessBundleListItem) => [
  ...new Set(
    bundle.hostPatterns.map(
      (pattern) => findTemplateForHostPattern(pattern)?.name ?? pattern.split(":")[0]
    )
  )
];

export const AgentVaultAccessBundlesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(SortOption.Name);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [bundleToEdit, setBundleToEdit] = useState<TAgentVaultAccessBundleListItem | null>(null);
  const [bundleToDelete, setBundleToDelete] = useState<TAgentVaultAccessBundleListItem | null>(
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

    return [...filtered].sort((a, b) =>
      sort === SortOption.Connections
        ? b.connectionCount - a.connectionCount
        : a.name.localeCompare(b.name)
    );
  }, [accessBundles, search, sort]);

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
      >
        {isAdmin && (
          <Button variant="av" onClick={() => setIsCreateOpen(true)}>
            Create Access Bundle
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Access Bundles</CardTitle>
          <CardDescription>
            Each bundle holds the connections an agent may use and the members who can mint a
            session over it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex-1">
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
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={SortOption.Name}>A–Z</SelectItem>
              <SelectItem value={SortOption.Connections}>Most connections</SelectItem>
            </SelectContent>
          </Select>
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
                <TableHead>Name</TableHead>
                <TableHead>Connections</TableHead>
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
                      <div className="flex flex-col">
                        <span>{bundle.name}</span>
                        {bundle.description && (
                          <span className="text-xs text-accent">{bundle.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {bundle.connectionCount === 0 ? (
                        <span className="text-muted">&mdash;</span>
                      ) : (
                        <div className="max-w-72">
                          <OverflowBadgeList
                            items={connectionLabels(bundle)}
                            getKey={(label) => label}
                            getLabel={(label) => label}
                            getVariant={() => "av"}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {bundle.memberCount} member{bundle.memberCount === 1 ? "" : "s"}
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
      <DeleteAccessBundleDialog
        accessBundle={bundleToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setBundleToDelete(null);
        }}
      />
    </div>
  );
};
