import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { VariableFormDialog } from "@app/components/agent-vault/VariableFormDialog";
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { toVariableReference } from "@app/helpers/agentVaultVariables";
import {
  useListAgentVaultVariables,
  useRevealAgentVaultVariableValue
} from "@app/hooks/api/agentVault";
import { TAgentVaultService, TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { DeleteVariableDialog } from "./DeleteVariableDialog";

enum SortColumn {
  Key = "key",
  UsedBy = "usedBy"
}

const MASK = "•".repeat(8);

// A revealed value is held against the version it was read from, so an edit hides it again.
const revealSlot = (variable: TAgentVaultVariable) => `${variable.id}:${variable.updatedAt}`;

type Props = {
  accessBundleId: string;
  services: TAgentVaultService[];
};

export const VariablesCard = ({ accessBundleId, services }: Props) => {
  const { data: variables = [], isPending } = useListAgentVaultVariables(accessBundleId);
  const revealValue = useRevealAgentVaultVariableValue();

  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState(SortColumn.Key);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [variableToEdit, setVariableToEdit] = useState<TAgentVaultVariable | null>(null);
  const [variableToDelete, setVariableToDelete] = useState<TAgentVaultVariable | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // Joined against the bundle's own service list, so a service deleted in the meantime drops out.
  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services]
  );
  const usedByOf = (variable: TAgentVaultVariable | null) =>
    (variable?.serviceIds ?? []).flatMap((serviceId) => {
      const service = servicesById.get(serviceId);
      return service ? [service] : [];
    });

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = variables.filter((variable) => variable.key.toLowerCase().includes(term));

    const compare = (a: TAgentVaultVariable, b: TAgentVaultVariable) =>
      sortColumn === SortColumn.UsedBy
        ? a.serviceIds.length - b.serviceIds.length || a.key.localeCompare(b.key)
        : a.key.localeCompare(b.key);

    const ordered = [...filtered].sort(compare);
    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [variables, search, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    if (direction === "none") {
      setSortColumn(SortColumn.Key);
      setSortDirection("ascending");
      return;
    }
    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: SortColumn) =>
    twMerge(
      "size-3.5 transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const toggleReveal = async (variable: TAgentVaultVariable) => {
    const slot = revealSlot(variable);
    if (revealed[slot] !== undefined) {
      setRevealed((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== slot)));
      return;
    }

    setRevealingId(variable.id);
    try {
      const value = await revealValue.mutateAsync({ accessBundleId, variableId: variable.id });
      setRevealed((prev) => ({ ...prev, [slot]: value }));
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    } finally {
      setRevealingId(null);
    }
  };

  const openForm = (variable: TAgentVaultVariable | null) => {
    setVariableToEdit(variable);
    setIsFormOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Variables
          <DocumentationLinkBadge href={AgentVaultDocsUrls.variables} />
        </CardTitle>
        <CardDescription>
          A variable stores one value that any service in this bundle can use as{" "}
          <code className="font-mono">{toVariableReference("KEY")}</code>.
        </CardDescription>
        <CardAction>
          <Button variant="av" onClick={() => openForm(null)}>
            <PlusIcon />
            Add Variable
          </Button>
        </CardAction>
      </CardHeader>

      {variables.length > 0 && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variables..."
            />
          </InputGroup>
        </CardContent>
      )}

      {!isPending && displayed.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {variables.length === 0 ? "No variables yet" : "No variables match your search"}
              </EmptyTitle>
              <EmptyDescription>
                {variables.length === 0
                  ? "Add a variable to use one value across this bundle's services."
                  : "Try a different search term."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        // Fixed layout, so revealing a secret can't resize the columns the way auto layout would.
        <Table className="w-full min-w-[640px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[35%]"
                sortDirection={sortColumn === SortColumn.Key ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Key, direction)}
              >
                Key
                <ChevronDownIcon className={sortIconClassName(SortColumn.Key)} />
              </TableHead>
              <TableHead className="w-[35%]">Value</TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.UsedBy ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.UsedBy, direction)}
              >
                Used By
                <ChevronDownIcon className={sortIconClassName(SortColumn.UsedBy)} />
              </TableHead>
              <TableHead variant="action" className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`variable-skeleton-${index}`}>
                  {Array.from({ length: 3 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`variable-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              displayed.map((variable) => {
                const revealedValue = revealed[revealSlot(variable)];
                const isRevealed = revealedValue !== undefined;
                const usedBy = usedByOf(variable);

                return (
                  <TableRow key={variable.id}>
                    <TableCell>
                      <span className="block truncate font-mono text-sm">{variable.key}</span>
                    </TableCell>
                    <TableCell>
                      {variable.isSecret ? (
                        <div className="flex items-center gap-1.5">
                          <LockIcon className="size-3.5 shrink-0 text-muted" aria-label="Secret" />
                          {isRevealed ? (
                            <span className="min-w-0 truncate font-mono text-sm">
                              {revealedValue}
                            </span>
                          ) : (
                            <span className="font-mono text-sm tracking-widest text-muted">
                              {MASK}
                            </span>
                          )}
                          <IconButton
                            variant="ghost"
                            size="xs"
                            className="shrink-0"
                            aria-label={`${isRevealed ? "Hide" : "Reveal"} ${variable.key}`}
                            isPending={revealingId === variable.id}
                            onClick={() => toggleReveal(variable)}
                          >
                            {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
                          </IconButton>
                        </div>
                      ) : (
                        <span className="block truncate font-mono text-sm">{variable.value}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {usedBy.length === 0 ? (
                        <span className="text-sm text-muted">Unused</span>
                      ) : (
                        <span className="block truncate text-sm">
                          {usedBy.map((service) => service.name).join(", ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell variant="action">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="Open variable actions">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <DropdownMenuItem onClick={() => openForm(variable)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => setVariableToDelete(variable)}
                          >
                            <TrashIcon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}

      <VariableFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        accessBundleId={accessBundleId}
        variable={variableToEdit}
        existingKeys={variables.map((variable) => variable.key)}
        usedByCount={usedByOf(variableToEdit).length}
      />

      <DeleteVariableDialog
        variable={variableToDelete}
        usedBy={usedByOf(variableToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setVariableToDelete(null);
        }}
      />
    </Card>
  );
};
