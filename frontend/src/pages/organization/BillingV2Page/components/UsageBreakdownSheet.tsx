import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowDownWideNarrow, Box, Building2, Search } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingV2BreakdownDimension,
  BillingV2BreakdownScope,
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2UsageBreakdown,
  useGetBillingV2UsageBreakdown
} from "@app/hooks/api";

import { pluralizeUnit } from "../billing-v2-format";
import { ProductIcon } from "./shared";

// user_identities is deliberately absent: it is already the user half of the summary split, and it
// carries no scope tree, so a tab for it would show a number the reader has just seen and nothing else.
const BREAKDOWN_DIMENSIONS = new Set<string>(
  Object.values(BillingV2BreakdownDimension).filter(
    (key) => key !== BillingV2BreakdownDimension.UserIdentities
  )
);

// A product's dimensions that can be explained by scope, in the order the entitlement lists them. More
// than one turns the sheet's body into tabs, the way Certificate Management carries CAs and both
// certificate meters.
export const breakdownableDimensions = (entitlement?: BillingV2Entitlement) =>
  (entitlement?.dimensions ?? []).filter((dim) => BREAKDOWN_DIMENSIONS.has(dim.key));

type SortOrder = "count" | "name";

const pct = (part: number, whole: number) => (whole > 0 ? `${(part / whole) * 100}%` : "0%");
const share = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type CountShareProps = {
  count: number;
  total: number;
  // Named on the top-level scope rows so the percentage says what it is a percentage of; omitted on
  // the nested rows, where the parent row has just established it.
  unitLabel?: string;
};

const CountShare = ({ count, total, unitLabel }: CountShareProps) => (
  <span className="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
    <span className="font-semibold text-foreground">{count.toLocaleString()}</span> ·{" "}
    {share(count, total)}
    {unitLabel ? ` of ${unitLabel}` : ""}
  </span>
);

type MeterProps = { className: string; width: string; height?: string };

const Meter = ({ className, width, height = "h-1.5" }: MeterProps) => (
  <div className={cn("w-full overflow-hidden rounded-xs bg-background", height)}>
    <div className={cn("animate-bar-grow h-full rounded-xs", className)} style={{ width }} />
  </div>
);

type ScopeRowProps = {
  scope: BillingV2BreakdownScope;
  // Total across every scope, so each row's bar is drawn to the same scale.
  machineCount: number;
  unitLabel: string;
  hasProjectDetail: boolean;
};

// One organization's contribution. Expanding it says where inside that org the units were created: on
// the org itself, or in one of its projects. Built on the shared Accordion so it opens with the same
// motion and hover colours as every other expandable row in the product.
const ScopeRow = ({ scope, machineCount, unitLabel, hasProjectDetail }: ScopeRowProps) => {
  // 85% is the strength DimensionMeter already uses for a filled meter, so a bar reads as a bar rather
  // than as a solid scope-coloured block next to it.
  const scopeTint = scope.isRoot ? "bg-org/85" : "bg-sub-org/85";
  // The org's own share sits directly under the org's bar at a different length. In the scope colour the
  // two read as the same measurement drawn twice, so it takes the neutral tint and leaves the scope
  // colour to mean "this is the whole organization".
  const orgLevelTint = "bg-neutral/85";
  const canExpand = hasProjectDetail && scope.count > 0;
  const projectLabel = `${scope.projects.length} ${scope.projects.length === 1 ? "project" : "projects"}`;

  const header = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <Building2
            className={cn("size-3.5 shrink-0", scope.isRoot ? "text-org" : "text-sub-org")}
          />
          <span className="truncate">{scope.name}</span>
          {scope.isRoot && <Badge variant="org">Root org</Badge>}
        </span>
        <CountShare count={scope.count} total={machineCount} unitLabel={unitLabel} />
      </div>
      <Meter className={scopeTint} width={pct(scope.count, machineCount)} />
    </div>
  );

  if (!canExpand) {
    return (
      <div className="rounded-md border border-border bg-container p-3">
        <div className="flex">{header}</div>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={scope.orgId}>
        <AccordionTrigger className="px-3 py-3">{header}</AccordionTrigger>
        <AccordionContent className="border-t border-border px-3 pt-3 pb-3.5">
          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] tracking-wide text-muted uppercase">
              Where these {unitLabel} were created
            </span>
            {scope.orgLevelCount > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-accent">
                    {/* A swatch rather than an icon: this row is the parent org itself, not a resource. */}
                    <span className={cn("size-2.5 shrink-0 rounded-xs", orgLevelTint)} />
                    <span className="truncate">{scope.isRoot ? "Org" : "Sub-Org"}</span>
                  </span>
                  <CountShare count={scope.orgLevelCount} total={scope.count} />
                </div>
                <Meter
                  className={orgLevelTint}
                  width={pct(scope.orgLevelCount, scope.count)}
                  height="h-1"
                />
              </div>
            )}
            {scope.projects.length > 0 && (
              <div className="flex items-center gap-2 border-t border-border pt-2.5">
                <span className="text-[11px] tracking-wide text-muted uppercase">Projects</span>
                <span className="text-[11px] text-muted">{projectLabel}</span>
              </div>
            )}
            {scope.projects.map((project) => (
              <div key={project.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  {/* Plain text, never a link: the breakdown names projects the reader may not open. */}
                  <span className="flex min-w-0 items-center gap-2 text-xs text-accent">
                    <Box className="size-3 shrink-0 text-project" />
                    <span className="truncate">{project.name}</span>
                  </span>
                  <CountShare count={project.count} total={scope.count} />
                </div>
                <Meter
                  className="bg-project/85"
                  width={pct(project.count, scope.count)}
                  height="h-1"
                />
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const BreakdownSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-28 w-full" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-14 w-full" />
  </div>
);

const BreakdownBody = ({ breakdown }: { breakdown: BillingV2UsageBreakdown }) => {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("count");

  const { total, userCount, machineCount, unit, hasProjectDetail, scopes } = breakdown;
  const unitLabel = pluralizeUnit(unit);
  // The identity meters bill people and machines as one figure, so the headline counts both and cannot
  // borrow the scope label, which names machines only. A dimension that counts a single kind keeps its
  // own noun.
  const totalLabel = userCount > 0 ? "unique identities" : unitLabel;
  const rootScope = scopes.find((scope) => scope.isRoot);
  const subOrgScopes = useMemo(() => scopes.filter((scope) => !scope.isRoot), [scopes]);
  const subOrgCount = subOrgScopes.reduce((sum, scope) => sum + scope.count, 0);

  // Counts only the orgs and projects that actually hold units of this dimension, which is what the
  // scope list already contains. Truthful here and free, because the breakdown is loaded.
  const projectCount = scopes.reduce((sum, scope) => sum + scope.projects.length, 0);
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const spanSummary = [
    "Created across the root org",
    subOrgScopes.length > 0 ? plural(subOrgScopes.length, "sub-org") : null,
    hasProjectDetail && projectCount > 0 ? plural(projectCount, "project") : null
  ]
    .filter(Boolean)
    .join(subOrgScopes.length > 0 && hasProjectDetail && projectCount > 0 ? ", " : " and ")
    .replace(/, ([^,]*)$/, " and $1");

  const visibleSubOrgs = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? subOrgScopes.filter((scope) => scope.name.toLowerCase().includes(term))
      : subOrgScopes;
    return [...matched].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : b.count - a.count
    );
  }, [subOrgScopes, query, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground tabular-nums">
            {total.toLocaleString()}
          </span>
          <span className="text-xs text-muted">{totalLabel}</span>
        </div>
        {userCount > 0 && (
          // The identity meters bill people and machines together, so the split is what makes the
          // headline figure legible. No colour keys: nothing on this sheet is keyed to them yet.
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-accent">
            <span>
              <span className="font-semibold text-foreground">{userCount.toLocaleString()}</span>{" "}
              user identities
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-semibold text-foreground">{machineCount.toLocaleString()}</span>{" "}
              {unitLabel}
            </span>
          </div>
        )}
      </div>

      {machineCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing counted yet</EmptyTitle>
            <EmptyDescription>
              No {unitLabel} have been created in this organization or its sub-organizations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-base font-semibold text-foreground">
              {sentenceCase(unitLabel)} by scope
            </span>
            <span className="text-xs text-muted">{spanSummary}</span>
          </div>

          {subOrgScopes.length > 0 && rootScope && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-foreground tabular-nums">
                  {machineCount.toLocaleString()}
                </span>
                <span className="text-xs text-muted">{unitLabel}</span>
              </div>
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-xs bg-background">
                <div
                  className="animate-bar-grow h-full rounded-xs bg-org/85"
                  style={{ width: pct(rootScope.count, machineCount) }}
                />
                {/* Staggered so the two segments read as one bar filling left to right, not two racing. */}
                <div
                  className="animate-bar-grow h-full rounded-xs bg-sub-org/85"
                  style={{ width: pct(subOrgCount, machineCount), animationDelay: "60ms" }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-accent">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-xs bg-org/85" />
                  <span className="font-semibold text-foreground">
                    {rootScope.count.toLocaleString()}
                  </span>{" "}
                  created in the root org
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-xs bg-sub-org/85" />
                  <span className="font-semibold text-foreground">
                    {subOrgCount.toLocaleString()}
                  </span>{" "}
                  created in sub-orgs
                </span>
              </div>
            </div>
          )}

          {rootScope && (
            <ScopeRow
              scope={rootScope}
              machineCount={machineCount}
              unitLabel={unitLabel}
              hasProjectDetail={hasProjectDetail}
            />
          )}

          {subOrgScopes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <InputGroup className="flex-1">
                  <InputGroupAddon align="inline-start">
                    <Search className="size-3.5" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search sub-organizations..."
                    aria-label="Search sub-organizations"
                  />
                </InputGroup>
                {/* md matches the search field's height; the fixed width keeps the control from
                    resizing as the label changes between the two sort orders. */}
                <Button
                  variant="outline"
                  size="md"
                  className="w-36 shrink-0 justify-start"
                  onClick={() => setSort((current) => (current === "count" ? "name" : "count"))}
                >
                  {sort === "count" ? <ArrowDownWideNarrow /> : <ArrowDownAZ />}
                  {sort === "count" ? "Most identities" : "Alphabetical"}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 px-0.5">
                <span className="text-[11px] tracking-wide text-muted uppercase">
                  Sub-organizations
                </span>
                <span className="text-[11px] text-muted">
                  {visibleSubOrgs.length}{" "}
                  {visibleSubOrgs.length === 1 ? "sub-organization" : "sub-organizations"}
                </span>
              </div>

              {visibleSubOrgs.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No matching sub-organizations</EmptyTitle>
                    <EmptyDescription>Clear the search to see all of them.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {visibleSubOrgs.map((scope) => (
                    <ScopeRow
                      key={scope.orgId}
                      scope={scope}
                      machineCount={machineCount}
                      unitLabel={unitLabel}
                      hasProjectDetail={hasProjectDetail}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

type UsageBreakdownSheetProps = {
  orgId: string;
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  onClose: () => void;
};

// Explains where one product's metered usage comes from: which organization in the billing tree, and
// which project inside it, each unit was created in. Counted live from the same predicates that feed the
// meter, so it explains the billed figure rather than offering a second opinion on it.
export const UsageBreakdownSheet = ({
  orgId,
  prod,
  entitlement,
  onClose
}: UsageBreakdownSheetProps) => {
  const dimensions = breakdownableDimensions(entitlement);
  const [activeKey, setActiveKey] = useState(dimensions[0]?.key ?? "");
  const activeDim = dimensions.find((dim) => dim.key === activeKey) ?? dimensions[0];

  const {
    data: breakdown,
    isPending,
    isError
  } = useGetBillingV2UsageBreakdown(orgId, activeDim?.key ?? null);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">
        <SheetHeader className="flex-row items-center gap-3 pr-12">
          <ProductIcon product={prod} />
          <div className="min-w-0">
            <SheetTitle className="text-base">Usage breakdown</SheetTitle>
            <SheetDescription className="mt-0.5">{prod.name}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          {dimensions.length > 1 && (
            <Tabs value={activeDim?.key} onValueChange={setActiveKey}>
              <TabsList variant="org">
                {dimensions.map((dim) => (
                  <TabsTrigger key={dim.key} value={dim.key}>
                    {dim.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {isPending && <BreakdownSkeleton />}

          {isError && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Couldn&apos;t load the breakdown</EmptyTitle>
                <EmptyDescription>
                  We couldn&apos;t work out where this usage comes from. Close this and try again in
                  a moment.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {breakdown && !isError && <BreakdownBody breakdown={breakdown} />}
        </div>

        <SheetFooter className="flex-row items-center justify-end border-t">
          <Button variant="org" size="sm" onClick={onClose}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
