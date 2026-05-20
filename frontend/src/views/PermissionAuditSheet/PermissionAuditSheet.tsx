import { useEffect, useMemo, useState } from "react";
import {
  BanIcon,
  BotIcon,
  CheckIcon,
  DownloadIcon,
  SearchIcon,
  SplitIcon,
  UserIcon
} from "lucide-react";

import {
  Accordion,
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType, TPermissionAuditSource } from "@app/hooks/api/projects/types";

import { getAuditSubjects } from "./permission-audit.config";
import { AuditState, ResourceAudit } from "./permission-audit.types";
import { evaluateAllResources, resolveSources } from "./permission-audit.utils";
import { buildAuditCsv, buildAuditCsvFilename, downloadCsv } from "./permission-audit-export";
import { PermissionAuditSection } from "./PermissionAuditSection";

export type PermissionAuditTargetType = "user" | "identity";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  targetType: PermissionAuditTargetType;
  sources: TPermissionAuditSource[] | undefined;
  isLoading: boolean;
};

type StateFilter = AuditState | "all";

const STATE_FILTERS: { id: StateFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "allow", label: "Allowed" },
  { id: "conditional", label: "Conditional" },
  { id: "forbid", label: "Forbidden" }
];

const TARGET_ICON: Record<PermissionAuditTargetType, typeof UserIcon> = {
  user: UserIcon,
  identity: BotIcon
};

const resourceMatchesSearch = (resource: ResourceAudit, term: string): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  return (
    resource.label.toLowerCase().includes(needle) ||
    resource.description.toLowerCase().includes(needle)
  );
};

const actionMatchesSearch = (action: ResourceAudit["actions"][number], term: string): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  const haystack = [
    action.label,
    action.description ?? "",
    ...action.grantedBy.map((s) => s.name),
    ...action.forbiddenBy.map((s) => s.name)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

const countMatching = (resources: ResourceAudit[], state: AuditState): number =>
  resources.reduce((sum, r) => sum + r.actions.filter((a) => a.state === state).length, 0);

const getCount = (
  counts: { all: number; allow: number; conditional: number; forbid: number },
  id: StateFilter
): number => {
  if (id === "all") return counts.all;
  if (id === "allow") return counts.allow;
  if (id === "conditional") return counts.conditional;
  return counts.forbid;
};

export const PermissionAuditSheet = ({
  open,
  onOpenChange,
  targetName,
  targetType,
  sources,
  isLoading
}: Props) => {
  const { currentProject } = useProject();
  const projectName = currentProject?.name ?? "";
  const projectType = currentProject?.type ?? ProjectType.SecretManager;

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [openSubjects, setOpenSubjects] = useState<string[] | null>(null);

  const resources = useMemo(() => {
    const descriptors = getAuditSubjects(projectType);
    if (!sources) {
      return evaluateAllResources(descriptors, []);
    }
    const resolved = resolveSources(sources);
    return evaluateAllResources(descriptors, resolved);
  }, [sources, projectType]);

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const resourceMatches = resourceMatchesSearch(r, search);
      return r.actions.some(
        (a) =>
          (resourceMatches || actionMatchesSearch(a, search)) &&
          (stateFilter === "all" || a.state === stateFilter)
      );
    });
  }, [resources, search, stateFilter]);

  const counts = useMemo(
    () => ({
      all: resources.reduce((sum, r) => sum + r.actions.length, 0),
      allow: countMatching(resources, "allow"),
      conditional: countMatching(resources, "conditional"),
      forbid: countMatching(resources, "forbid")
    }),
    [resources]
  );

  useEffect(() => {
    if (!sources) return;
    setOpenSubjects(
      resources
        .filter((r) => r.allowedCount + r.conditionalCount > 0)
        .map((r) => r.subject as string)
    );
  }, [sources, resources]);

  const handleExportCsv = () => {
    const csv = buildAuditCsv(resources);
    downloadCsv(buildAuditCsvFilename(targetName, projectName), csv);
  };

  const TargetIcon = TARGET_ICON[targetType];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col gap-y-0 p-0 sm:max-w-6xl">
        <SheetHeader className="border-b border-mineshaft-700 px-6 py-5">
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex items-center gap-2">
              Permission Audit
              <span className="text-muted">·</span>
              <span className="inline-flex items-center gap-1 text-sm font-normal text-mineshaft-200">
                <TargetIcon className="size-3.5" />
                {targetName}
              </span>
              <Badge variant="info">Effective Access</Badge>
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs">
              Combined view of all permissions granted to{" "}
              <span className="text-mineshaft-100">{targetName}</span>
              {projectName ? (
                <>
                  {" "}
                  in <span className="text-mineshaft-100">{projectName}</span>
                </>
              ) : null}{" "}
              — direct roles, group-inherited roles, and additional privileges.
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-3 border-b border-mineshaft-700 px-6 py-3">
          <Select
            value={stateFilter}
            onValueChange={(value) => setStateFilter(value as StateFilter)}
          >
            <SelectTrigger className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_FILTERS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label} <span className="text-muted">{getCount(counts, opt.id)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon>
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search resources, actions, or sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="outline"
                size="md"
                onClick={handleExportCsv}
                isDisabled={isLoading || resources.length === 0}
                aria-label="Export CSV"
                className="shrink-0"
              >
                <DownloadIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Export CSV</TooltipContent>
          </Tooltip>

          <div className="flex shrink-0 items-center gap-3 text-xs text-mineshaft-400">
            <span className="flex items-center gap-1">
              <CheckIcon className="size-3 text-success" /> Allow
            </span>
            <span className="flex items-center gap-1">
              <SplitIcon className="size-3 text-warning" /> Conditional
            </span>
            <span className="flex items-center gap-1">
              <BanIcon className="size-3 text-danger" /> Forbid
            </span>
            <span className="flex items-center gap-1 text-muted">— No Grant (Forbid)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="overflow-clip rounded-md border border-border bg-container">
              {resources.map((resource, idx) => (
                <div
                  key={resource.subject}
                  className={`flex min-h-12 items-center justify-between gap-4 px-4 py-3 ${
                    idx > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && filteredResources.length === 0 && (
            <Empty className="rounded-md border border-border">
              <EmptyHeader>
                <EmptyTitle>No matching resources</EmptyTitle>
                <EmptyDescription>Try clearing the search or state filter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {!isLoading && openSubjects !== null && filteredResources.length > 0 && (
            <Accordion
              type="multiple"
              value={openSubjects}
              onValueChange={setOpenSubjects}
              className="overflow-clip rounded-md border border-border bg-container hover:bg-container-hover"
            >
              {filteredResources.map((resource) => (
                <PermissionAuditSection
                  key={resource.subject}
                  resource={resource}
                  stateFilter={stateFilter}
                  search={search}
                />
              ))}
            </Accordion>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
