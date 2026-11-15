import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { MAX_PERSONAL_VARIABLES, MAX_VARIABLES } from "@app/helpers/agentVaultVariables";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { AgentVaultVariableScope } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AgentVaultDocs, useIsAgentVaultAdmin } from "../resources/agent-vault-utils";
import { DateCell } from "../resources/shared";
import { VariableDialog } from "../resources/variable-dialog";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/variables");
const TABLE = "agentVaultVariablesTable";
const MASK = "\u2022".repeat(8);
const SERVICES_SHOWN = 2;

const revealSlot = (variable: TAgentVaultVariable) => `${variable.id}:${variable.updatedAt}`;

const UsedBy = ({ variable }: { variable: TAgentVaultVariable }) => {
  const services = variable.usedByServices;
  if (!services.length) return <Meta>-</Meta>;
  const hidden = services.slice(SERVICES_SHOWN);
  return (
    <Inline gap={4} align="center" wrap={false}>
      {services.slice(0, SERVICES_SHOWN).map((service) => (
        <Badge key={service.id} tone="outline">
          {service.name}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.map((service) => service.name).join(", ")}>
          <Meta tabIndex={0}>+{hidden.length}</Meta>
        </Tooltip>
      )}
    </Inline>
  );
};

const Variables = ({ projectId, scope }: { projectId: string; scope: AgentVaultVariableScope }) => {
  const resources = useV4Adapter("agentVaultResources");
  const reveal = resources.useRevealVariableValue();
  const isPersonal = scope === AgentVaultVariableScope.Personal;
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sort, setSort] = useState<{
    columnId: string;
    direction: "asc" | "desc";
  }>({
    columnId: "key",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [dialog, setDialog] = useState<{ variable?: TAgentVaultVariable }>();
  const [deleting, setDeleting] = useState<TAgentVaultVariable>();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string>();
  const searchTerm = debouncedSearch.trim();

  const { data, isPending } = resources.useVariables(projectId, {
    scope,
    search: searchTerm || undefined,
    orderBy: sort.columnId === "serviceCount" ? "serviceCount" : "key",
    orderDirection: sort.direction,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: unfiltered } = resources.useVariables(projectId, {
    scope,
    limit: 1
  });
  const remove = resources.useDeleteVariable(projectId);
  const variables = data?.variables ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  const maxVariables = isPersonal ? MAX_PERSONAL_VARIABLES : MAX_VARIABLES;
  const isAtLimit = (unfiltered?.totalCount ?? 0) >= maxVariables;
  const limitReason = isPersonal
    ? `You can keep at most ${maxVariables} personal variables. Delete an unused one first.`
    : `This project can hold at most ${maxVariables} global variables. Delete an unused one first.`;
  const openCreate = () => {
    if (!isAtLimit) setDialog({});
  };
  useAgentVaultCreateIntent(openCreate, Boolean(unfiltered));

  const toggleReveal = async (variable: TAgentVaultVariable) => {
    const slot = revealSlot(variable);
    if (revealed[slot] !== undefined) {
      setRevealed((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== slot)));
      return;
    }
    setRevealingId(variable.id);
    try {
      const value = await reveal.mutateAsync(variable.id);
      setRevealed((prev) => ({ ...prev, [slot]: value }));
    } catch (error) {
      failed(`Failed to reveal ${variable.key}`, error);
    } finally {
      setRevealingId(undefined);
    }
  };

  const copyValue = async (variable: TAgentVaultVariable) => {
    let request: Promise<string> | undefined;
    try {
      request = reveal.mutateAsync(variable.id);
      if (typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(await request);
      } else {
        const blob = request.then((value) => new Blob([value], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      }
      saved(`Copied the value of ${variable.key}`);
    } catch (error) {
      const isRequestError = await request?.then(() => false).catch(() => true);
      failed(
        isRequestError
          ? `Failed to copy ${variable.key}`
          : "Could not copy the value. Your browser blocked clipboard access.",
        isRequestError ? error : undefined
      );
    }
  };

  const columns: DataTableColumn<TAgentVaultVariable>[] = [
    {
      id: "key",
      header: "Key",
      primary: true,
      mono: true,
      sortable: true,
      width: 280,
      text: (variable) => variable.key,
      render: (variable) => <span title={variable.key}>{variable.key}</span>
    },
    {
      id: "value",
      header: "Value",
      grow: true,
      minWidth: 200,
      render: (variable) => {
        const value = revealed[revealSlot(variable)];
        return (
          <Inline gap={4} align="center" wrap={false}>
            <Meta mono title={value}>
              {value ?? MASK}
            </Meta>
            <Button
              variant="ghost"
              size="icon-xs"
              iconOnly
              icon={value === undefined ? "eye" : "eye-off"}
              loading={revealingId === variable.id}
              onClick={(event) => {
                event.stopPropagation();
                toggleReveal(variable);
              }}
            >
              {`${value === undefined ? "Reveal" : "Hide"} ${variable.key}`}
            </Button>
          </Inline>
        );
      }
    },
    {
      id: "serviceCount",
      header: "Used by",
      sortable: true,
      width: 240,
      render: (variable) => <UsedBy variable={variable} />
    },
    {
      id: "updated",
      header: "Updated",
      width: 128,
      render: (variable) => <DateCell value={variable.updatedAt} />
    }
  ];

  const rowActions: DataTableRowActions<TAgentVaultVariable> = {
    menuLabel: "Variable options",
    inline: [
      {
        label: "Edit variable",
        icon: PencilIcon,
        onSelect: (variable) => setDialog({ variable })
      }
    ],
    renderMenu: (variable) => (
      <>
        <DropdownMenuItem onSelect={() => copyValue(variable)}>
          <Icon name="copy" />
          Copy value
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(variable)}>
          <Icon name="trash" />
          Delete variable
        </DropdownMenuItem>
      </>
    )
  };

  const usedBy = deleting?.usedByServices ?? [];
  const inUse = usedBy.length > 0;
  let deleteDescription = "Its value is deleted with it. This cannot be undone.";
  if (inUse)
    deleteDescription = isPersonal
      ? `Your personal values for ${usedBy.length === 1 ? "a service use" : `${usedBy.length} services use`} this variable: ${usedBy.map((service) => service.name).join(", ")}. Remove it from ${usedBy.length === 1 ? "the service" : "those services"} before you delete it.`
      : `${usedBy.length === 1 ? "A service uses" : `${usedBy.length} services use`} this variable: ${usedBy.map((service) => service.name).join(", ")}. Remove the reference before you delete it.`;

  return (
    <Stack gap={16}>
      <Inline gap={8} wrap={false}>
        <Input
          icon="search"
          aria-label="Search variables"
          placeholder="Search variables..."
          kbd="/"
          maxLength={255}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Button
          variant="accent"
          icon="plus"
          disabledReason={isAtLimit ? limitReason : undefined}
          onClick={openCreate}
        >
          {`Add ${isPersonal ? "personal" : "global"} variable`}
        </Button>
      </Inline>
      <DataTable
        label={isPersonal ? "Personal variables" : "Global variables"}
        rows={variables}
        columns={columns}
        loading={isPending}
        getRowId={(variable) => variable.id}
        rowLabel={(variable) => variable.key}
        rowActions={rowActions}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        empty={
          searchTerm ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="No variables match your search"
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="key"
              title="No variables yet"
              description={
                isPersonal
                  ? "Reuse one of your values across the services you set up."
                  : "Store a value once and use it in any service as {{KEY}}."
              }
            />
          )
        }
        pagination={
          totalCount > 0 ? (
            <Pagination
              label="Variable pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={perPage}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPerPage(next);
                setPage(1);
                setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
              }}
            />
          ) : undefined
        }
      />
      {dialog && (
        <VariableDialog
          key={dialog.variable?.id ?? "new"}
          projectId={projectId}
          scope={scope}
          variable={dialog.variable}
          onOpenChange={(open) => !open && setDialog(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleting?.key ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{inUse ? "Close" : "Cancel"}</AlertDialogCancel>
            {!inUse && (
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.id);
                    saved(`Variable ${deleting.key} deleted`);
                  } catch (error) {
                    failed("Failed to delete variable", error);
                  }
                  setDeleting(undefined);
                }}
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};

export const AgentVaultVariablesPage = () => {
  const { orgId, projectId } = useParams({ from: route });
  const { selectedTab } = useSearch({ from: route });
  const navigate = useNavigate();
  const { isAdmin, isPending } = useIsAgentVaultAdmin(projectId);
  const scope =
    isAdmin && selectedTab !== AgentVaultVariableScope.Personal
      ? AgentVaultVariableScope.Global
      : AgentVaultVariableScope.Personal;

  return (
    <TooltipProvider>
      <PageTitle title="Variables" />
      <Stack gap={24}>
        <PageHeader
          title="Variables"
          badges={<DocumentationLink href={AgentVaultDocs.variables} subject="variables" />}
          actions={
            isAdmin ? (
              <ToggleGroup
                type="single"
                aria-label="Variable scope"
                value={scope}
                onValueChange={(next) => {
                  if (!next) return;
                  navigate({
                    to: route,
                    params: { orgId, projectId },
                    search: (prev) => ({
                      ...prev,
                      selectedTab: next as AgentVaultVariableScope
                    })
                  });
                }}
              >
                <ToggleGroupItem value={AgentVaultVariableScope.Global}>Global</ToggleGroupItem>
                <ToggleGroupItem value={AgentVaultVariableScope.Personal}>Personal</ToggleGroupItem>
              </ToggleGroup>
            ) : undefined
          }
        />
        {!isPending && (
          <Variables key={`${projectId}:${scope}`} projectId={projectId} scope={scope} />
        )}
      </Stack>
    </TooltipProvider>
  );
};
