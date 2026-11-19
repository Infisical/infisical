import { useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "lucide-react";

import { DeleteHookDialog } from "@app/components/agent-vault/hooks/DeleteHookDialog";
import { describeHookRule } from "@app/components/agent-vault/hooks/hookSchema";
import { HookSheet } from "@app/components/agent-vault/hooks/HookSheet";
import { AgentVaultHooksUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
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
  DropdownMenuSeparator,
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
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission,
  useProject,
  useSubscription
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useGetAgentVaultHook, useListAgentVaultHooks } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const RulesSummary = ({ hook }: { hook: TAgentVaultHook }) => {
  if (!hook.rules.length) return <span className="text-muted">All traffic</span>;
  const lines = hook.rules.map(describeHookRule);
  if (lines.length === 1) return <span className="truncate">{lines[0]}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="truncate" data-row-interactive>
          {lines.length} rules
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <ul className="flex flex-col gap-0.5">
          {lines.map((line) => (
            <li key={line} className="break-all">
              {line}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

export const HooksCard = () => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const {
    id: openHookId,
    isOpen: isHookOpen,
    openSheet,
    closeSheet
  } = useAgentVaultSheetState("hookId");
  const { permission } = useProjectPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const isOnPlan = Boolean(subscription.agentVaultHooks);
  const canCreate = permission.can(
    ProjectPermissionAgentVaultHookActions.Create,
    ProjectPermissionSub.AgentVaultHooks
  );
  const canEdit = permission.can(
    ProjectPermissionAgentVaultHookActions.Edit,
    ProjectPermissionSub.AgentVaultHooks
  );
  const canDelete = permission.can(
    ProjectPermissionAgentVaultHookActions.Delete,
    ProjectPermissionSub.AgentVaultHooks
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultHooksTable", PreferenceKey.PerPage, 20)
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [hookToDelete, setHookToDelete] = useState<TAgentVaultHook | null>(null);

  const searchTerm = debouncedSearch.trim();
  const [pagedSearchTerm, setPagedSearchTerm] = useState(searchTerm);
  if (pagedSearchTerm !== searchTerm) {
    setPagedSearchTerm(searchTerm);
    setPage(1);
  }
  const { data, isPending } = useListAgentVaultHooks(projectId, {
    search: searchTerm || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const displayed = data?.hooks ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  const hasHooks = totalCount > 0 || Boolean(searchTerm);

  const { data: openHook, isPending: isOpenHookPending } = useGetAgentVaultHook(
    projectId,
    openHookId ?? ""
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Hooks
          <DocumentationLinkBadge href={AgentVaultDocsUrls.hooks} />
        </CardTitle>
        <CardDescription>
          A hook is asked before the proxy sends a request, and the request goes on only if it
          allows it. A session uses a hook when it is created with one.
        </CardDescription>
        {canCreate && (
          <CardAction>
            <Button
              variant="av"
              onClick={() =>
                isOnPlan
                  ? setIsCreateOpen(true)
                  : openUpgradeGate({
                      intent: AgentVaultHooksUpgradeIntent,
                      paywallKey: "agent-vault.hooks"
                    })
              }
            >
              <PlusIcon />
              Create Hook
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {hasHooks && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hooks..."
            />
          </InputGroup>
        </CardContent>
      )}

      {!isPending && displayed.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{hasHooks ? "No hooks match your search" : "No hooks yet"}</EmptyTitle>
              <EmptyDescription>
                {hasHooks
                  ? "Try a different search term."
                  : "Create a hook, then pick it when you create a session."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-1/4">
                Name
              </TableHead>
              <TableHead isTruncatable className="w-2/5">
                URL
              </TableHead>
              <TableHead isTruncatable>Rules</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`hook-skeleton-${index}`}>
                  {Array.from({ length: 3 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`hook-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              displayed.map((hook) => (
                <TableRow key={hook.id} linked>
                  <TableCell isTruncatable>
                    <RowLink
                      to="/organizations/$orgId/projects/agent-vault/$projectId/hooks"
                      params={{ orgId: currentOrg.id, projectId }}
                      search={{ hookId: hook.id }}
                      title={hook.description ?? undefined}
                    >
                      {hook.name}
                    </RowLink>
                  </TableCell>
                  <TableCell isTruncatable className="font-mono text-xs">
                    {hook.url}
                  </TableCell>
                  <TableCell isTruncatable>
                    <RulesSummary hook={hook} />
                  </TableCell>
                  <TableCell variant="action">
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="Open hook actions"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          sideOffset={2}
                          align="end"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {canEdit && (
                            <DropdownMenuItem onClick={() => openSheet(hook.id)}>
                              <PencilIcon />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canEdit && canDelete && <DropdownMenuSeparator />}
                          {canDelete && (
                            <DropdownMenuItem
                              variant="danger"
                              onClick={() => setHookToDelete(hook)}
                            >
                              <TrashIcon />
                              Delete
                            </DropdownMenuItem>
                          )}
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
              setUserTablePreference("agentVaultHooksTable", PreferenceKey.PerPage, newPerPage);
            }}
          />
        </CardContent>
      )}

      <HookSheet isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <HookSheet
        isOpen={isHookOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        hook={openHook}
        isLoading={isOpenHookPending}
        isReadOnly={!canEdit || !openHook}
      />

      {upgradeGate}

      <DeleteHookDialog
        hook={hookToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setHookToDelete(null);
        }}
      />
    </Card>
  );
};
