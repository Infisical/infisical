import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { format } from "date-fns";
import { MoreHorizontal, Plus, Radar, Search, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Button,
  Card,
  CardContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  TPamDiscoverySource,
  useDeletePamDiscoverySource,
  useListPamDiscoverySources,
  useListPamDiscoveryTypes,
  useTriggerPamDiscoveryScan
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { PAM_DISCOVERY_TABS } from "../components/pamResourceTabs";
import { AddDiscoverySourceSheet } from "./components/AddDiscoverySourceSheet";
import { DiscoverySourceDetailSheet } from "./components/DiscoverySourceDetailSheet";
import { DiscoveryStatusBadge } from "./components/DiscoveryStatusBadge";

export const PamDiscoveryPage = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const detailSheet = usePamSheetState("discoverySourceId");

  const { data: sources = [], isLoading } = useListPamDiscoverySources({
    search: debouncedSearch || undefined
  });
  const { data: discoveryTypes = [] } = useListPamDiscoveryTypes();
  const triggerScan = useTriggerPamDiscoveryScan();
  const deleteSource = useDeletePamDiscoverySource();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addSource",
    "deleteSource"
  ] as const);

  const typeMap = useMemo(
    () => Object.fromEntries(discoveryTypes.map((t) => [t.type, t])),
    [discoveryTypes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sources.filter((s) => s.name.toLowerCase().includes(q)) : sources;
  }, [sources, search]);

  const handleScan = (source: TPamDiscoverySource) => {
    triggerScan.mutate(
      { discoveryType: source.discoveryType, sourceId: source.id },
      { onSuccess: () => createNotification({ type: "success", text: "Scan started" }) }
    );
  };

  const handleDelete = async () => {
    const source = popUp.deleteSource.data as TPamDiscoverySource;
    await deleteSource.mutateAsync({ discoveryType: source.discoveryType, sourceId: source.id });
    createNotification({ type: "success", text: "Discovery source deleted" });
    handlePopUpClose("deleteSource");
  };

  return (
    <>
      <Helmet>
        <title>Discovery</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.PAM}
          icon={Radar}
          title="Discovery"
          description="Scan external systems for privileged accounts and import them into PAM."
        />

        <Card className="mt-4">
          <CardContent className="flex items-center gap-3">
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <Button variant="pam" onClick={() => handlePopUpOpen("addSource")}>
              <Plus />
              Add Source
            </Button>
          </CardContent>

          {isLoading && (
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {!isLoading && filtered.length === 0 && (
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No discovery sources yet</EmptyTitle>
                  <EmptyDescription>Add a source to start discovering accounts.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isLoading && filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-32">Schedule</TableHead>
                  <TableHead className="w-48">Last Run</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((source) => {
                  const meta = typeMap[source.discoveryType];
                  return (
                    <TableRow
                      key={source.id}
                      className="cursor-pointer"
                      onClick={() => detailSheet.openSheet(source.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {meta?.icon && (
                            <img
                              src={`/images/integrations/${meta.icon}`}
                              alt={meta.name}
                              className="size-5 rounded-sm"
                            />
                          )}
                          <span className="font-medium text-foreground">
                            <HighlightText text={source.name} highlight={search} />
                          </span>
                          <span className="text-sm text-muted">
                            {meta?.name ?? source.discoveryType}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DiscoveryStatusBadge
                          status={source.lastRunStatus}
                          error={source.lastRunError}
                        />
                      </TableCell>
                      <TableCell className="text-muted capitalize">{source.schedule}</TableCell>
                      <TableCell className="text-muted">
                        {source.lastRunAt
                          ? format(new Date(source.lastRunAt), "MMM d, yyyy h:mm a")
                          : "Never"}
                      </TableCell>
                      <TableCell className="w-12">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label="Source actions"
                              className="text-muted"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={4}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {PAM_DISCOVERY_TABS.map((tab) => (
                              <DropdownMenuItem
                                key={tab.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  detailSheet.openSheet(source.id, tab.value);
                                }}
                              >
                                <tab.icon />
                                {tab.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleScan(source);
                              }}
                            >
                              <Radar />
                              Scan Now
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deleteSource", source);
                              }}
                            >
                              <Trash2 />
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
        </Card>
      </div>

      <AddDiscoverySourceSheet
        isOpen={popUp.addSource.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("addSource");
        }}
      />

      <DiscoverySourceDetailSheet
        isOpen={detailSheet.isOpen}
        sourceId={detailSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) detailSheet.closeSheet();
        }}
      />

      <DeleteActionModal
        isOpen={popUp.deleteSource.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteSource", isOpen)}
        title={`Delete ${(popUp.deleteSource.data as TPamDiscoverySource | undefined)?.name ?? "source"}?`}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </>
  );
};
