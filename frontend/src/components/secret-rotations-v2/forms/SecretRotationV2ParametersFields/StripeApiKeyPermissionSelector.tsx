import { useMemo, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

import {
  Button,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  TStripeApiKeyPermissionGroup,
  TStripeApiKeyPermissionResource
} from "@app/hooks/api/secretRotationsV2/types/stripe-api-key-rotation";

enum AccessLevel {
  None = "none",
  Read = "read",
  Write = "write"
}

const LEVEL_LABELS: Record<AccessLevel, string> = {
  [AccessLevel.None]: "None",
  [AccessLevel.Read]: "Read",
  [AccessLevel.Write]: "Write"
};

const ACTIVE_SEGMENT_CLASSES: Record<AccessLevel, string> = {
  [AccessLevel.None]: "data-[state=checked]:bg-foreground/10 data-[state=checked]:text-foreground",
  [AccessLevel.Read]: "data-[state=checked]:bg-info/15 data-[state=checked]:text-info",
  [AccessLevel.Write]: "data-[state=checked]:bg-warning/15 data-[state=checked]:text-warning"
};

const getLevels = (resource: TStripeApiKeyPermissionResource) => [
  AccessLevel.None,
  ...(resource.read ? [AccessLevel.Read] : []),
  ...(resource.write ? [AccessLevel.Write] : [])
];

const getLevel = (resource: TStripeApiKeyPermissionResource, granted: Set<string>) => {
  if (resource.write && granted.has(resource.write)) return AccessLevel.Write;
  if (resource.read && granted.has(resource.read)) return AccessLevel.Read;
  return AccessLevel.None;
};

// Write sends the resource's read permission too, the same way the Stripe dashboard treats write as
// including read.
const toPermissions = (resource: TStripeApiKeyPermissionResource, level: AccessLevel) => {
  if (level === AccessLevel.None) return [];
  if (level === AccessLevel.Read) return resource.read ? [resource.read] : [];
  return [resource.read, resource.write].filter((permission): permission is string =>
    Boolean(permission)
  );
};

// A bulk level a resource cannot take falls to the nearest level below it, never above: "Set all
// Write" still grants every read-only resource, and "Set all Read" clears a write-only resource
// rather than leaving it able to write.
const resolveBulkLevel = (resource: TStripeApiKeyPermissionResource, level: AccessLevel) => {
  if (getLevels(resource).includes(level)) return level;
  if (level === AccessLevel.Write) return AccessLevel.Read;
  return AccessLevel.None;
};

const matchesQuery = (
  group: TStripeApiKeyPermissionGroup,
  resource: TStripeApiKeyPermissionResource,
  query: string
) =>
  [group.name, resource.name, resource.read, resource.write].some((text) =>
    text?.toLowerCase().includes(query)
  );

type SegmentedControlProps<T extends string> = {
  value: T;
  options: { value: T; label: string; className?: string }[];
  onValueChange: (value: T) => void;
  "aria-label": string;
  segmentClassName?: string;
};

const SegmentedControl = <T extends string>({
  value,
  options,
  onValueChange,
  segmentClassName,
  ...props
}: SegmentedControlProps<T>) => (
  <RadioGroupPrimitive.Root
    value={value}
    onValueChange={(next) => onValueChange(next as T)}
    orientation="horizontal"
    className="flex shrink-0 gap-0.5 rounded-md border border-border bg-popover p-0.5"
    aria-label={props["aria-label"]}
  >
    {options.map((option) => (
      <RadioGroupPrimitive.Item
        key={option.value}
        value={option.value}
        className={cn(
          "cursor-pointer rounded-sm text-xs text-accent outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "data-[state=checked]:bg-foreground/10 data-[state=checked]:text-foreground",
          segmentClassName,
          option.className
        )}
      >
        {option.label}
      </RadioGroupPrimitive.Item>
    ))}
  </RadioGroupPrimitive.Root>
);

type Props = {
  groups: TStripeApiKeyPermissionGroup[];
  value: string[];
  onChange: (value: string[]) => void;
  isLoading?: boolean;
};

export const StripeApiKeyPermissionSelector = ({ groups, value, onChange, isLoading }: Props) => {
  const [query, setQuery] = useState("");
  const [isGrantedOnly, setIsGrantedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const granted = useMemo(() => new Set(value), [value]);

  const setLevels = (patch: Map<TStripeApiKeyPermissionResource, AccessLevel>) => {
    // Only the resources in the patch are rewritten, so an existing rotation keeps the exact
    // permissions it was saved with for everything the user did not touch.
    const touched = new Set(
      [...patch.keys()].flatMap((resource) => [resource.read, resource.write])
    );
    const next = value.filter((permission) => !touched.has(permission));
    patch.forEach((level, resource) => next.push(...toPermissions(resource, level)));
    onChange(next);
  };

  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          rows: group.resources.filter(
            (resource) =>
              matchesQuery(group, resource, normalizedQuery) &&
              (!isGrantedOnly || getLevel(resource, granted) !== AccessLevel.None)
          ),
          grantedCount: group.resources.filter(
            (resource) => getLevel(resource, granted) !== AccessLevel.None
          ).length
        }))
        .filter((group) => group.rows.length),
    [groups, normalizedQuery, isGrantedOnly, granted]
  );

  const summary = useMemo(() => {
    const levels = groups.flatMap(({ resources }) =>
      resources.map((resource) => getLevel(resource, granted))
    );
    const read = levels.filter((level) => level === AccessLevel.Read).length;
    const write = levels.filter((level) => level === AccessLevel.Write).length;
    return `${read + write} resources · ${read} read · ${write} write`;
  }, [groups, granted]);

  const applyToVisible = (level: AccessLevel) => {
    const patch = new Map<TStripeApiKeyPermissionResource, AccessLevel>();
    visibleGroups.forEach(({ rows }) =>
      rows.forEach((resource) => patch.set(resource, resolveBulkLevel(resource, level)))
    );
    setLevels(patch);
  };

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel id="stripe-permissions-label" size="sm">
          Permissions
        </FieldLabel>
        {!isLoading && (
          <span className="shrink-0 text-xs whitespace-nowrap text-accent">{summary}</span>
        )}
      </div>
      <p className="text-xs text-muted">
        Grant only the access your application needs. The generated key gets exactly these
        permissions.
      </p>
      <div
        role="group"
        aria-labelledby="stripe-permissions-label"
        className="mt-1.5 overflow-hidden rounded-md border border-border bg-container"
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <InputGroup className="h-8 flex-1 bg-popover">
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-3.5" strokeWidth={1.75} />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resources"
              aria-label="Search Stripe resources"
              className="text-[13px]"
            />
          </InputGroup>
          <SegmentedControl
            aria-label="Show resources"
            value={isGrantedOnly ? "granted" : "all"}
            onValueChange={(next) => setIsGrantedOnly(next === "granted")}
            options={[
              { value: "all", label: "All" },
              { value: "granted", label: "Granted" }
            ]}
            segmentClassName="h-[26px] px-2.5"
          />
          <div className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-accent">
            Set all
            {[AccessLevel.None, AccessLevel.Read, AccessLevel.Write].map((level) => (
              <Button
                key={level}
                type="button"
                variant="outline"
                size="xs"
                className="rounded-md text-label hover:text-foreground"
                isDisabled={isLoading || !visibleGroups.length}
                onClick={() => applyToVisible(level)}
              >
                {LEVEL_LABELS[level]}
              </Button>
            ))}
          </div>
        </div>
        <div className="max-h-[400px] overflow-auto">
          {isLoading &&
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-10 items-center border-b border-border-faint px-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          {!isLoading &&
            visibleGroups.map(({ name: groupName, resources, rows, grantedCount }) => {
              const isExpanded = !collapsed[groupName] || Boolean(normalizedQuery);

              return (
                <div key={groupName}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
                    }
                    className="sticky top-0 z-[1] flex h-8 w-full cursor-pointer items-center gap-2 border-b border-border bg-card px-3 text-left text-xs font-medium text-label outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <ChevronDownIcon
                      className={cn(
                        "size-3 transition-transform duration-200 ease-in-out",
                        !isExpanded && "-rotate-90"
                      )}
                      strokeWidth={2}
                    />
                    <span className="flex-1">{groupName}</span>
                    <span className="shrink-0 font-normal whitespace-nowrap text-muted">
                      {grantedCount} of {resources.length} granted
                    </span>
                  </button>
                  {isExpanded &&
                    rows.map((resource) => {
                      const level = getLevel(resource, granted);

                      return (
                        <div
                          key={resource.name}
                          className="flex h-10 items-center justify-between gap-3 border-b border-border-faint pr-3 pl-8 hover:bg-container-hover"
                        >
                          <span
                            className={cn(
                              "truncate text-[13px]",
                              level === AccessLevel.None ? "text-label" : "text-foreground"
                            )}
                          >
                            {resource.name}
                          </span>
                          <SegmentedControl
                            aria-label={`${groupName} ${resource.name} access`}
                            value={level}
                            onValueChange={(next) => setLevels(new Map([[resource, next]]))}
                            options={getLevels(resource).map((option) => ({
                              value: option,
                              label: LEVEL_LABELS[option],
                              className: ACTIVE_SEGMENT_CLASSES[option]
                            }))}
                            segmentClassName="h-6 w-13"
                          />
                        </div>
                      );
                    })}
                </div>
              );
            })}
          {!isLoading && !visibleGroups.length && (
            <div className="p-6 text-center text-[13px] text-accent">
              {normalizedQuery ? "No resources match this search." : "No resources granted yet."}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
