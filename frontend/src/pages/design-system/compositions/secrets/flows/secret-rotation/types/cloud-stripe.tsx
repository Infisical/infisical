import { useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { FieldDescription, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Separator } from "@app/components/v4/ui/separator";
import { SmallText, Text } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import {
  STRIPE_API_KEY_PERMISSION_GROUPS,
  type TStripeApiKeyPermissionGroup,
  type TStripeApiKeyPermissionResource
} from "./cloud-stripe-permissions";

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

const toPermissions = (resource: TStripeApiKeyPermissionResource, level: AccessLevel) => {
  if (level === AccessLevel.None) return [];
  if (level === AccessLevel.Read) return resource.read ? [resource.read] : [];
  return [resource.read, resource.write].filter((permission): permission is string =>
    Boolean(permission)
  );
};

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

export function StripePermissionSelector({
  value,
  onChange
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [isGrantedOnly, setIsGrantedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const granted = useMemo(() => new Set(value), [value]);

  const setLevels = (patch: Map<TStripeApiKeyPermissionResource, AccessLevel>) => {
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
      STRIPE_API_KEY_PERMISSION_GROUPS.map((group) => ({
        ...group,
        rows: group.resources.filter(
          (resource) =>
            matchesQuery(group, resource, normalizedQuery) &&
            (!isGrantedOnly || getLevel(resource, granted) !== AccessLevel.None)
        ),
        grantedCount: group.resources.filter(
          (resource) => getLevel(resource, granted) !== AccessLevel.None
        ).length
      })).filter((group) => group.rows.length),
    [normalizedQuery, isGrantedOnly, granted]
  );

  const summary = useMemo(() => {
    const levels = STRIPE_API_KEY_PERMISSION_GROUPS.flatMap(({ resources }) =>
      resources.map((resource) => getLevel(resource, granted))
    );
    const read = levels.filter((level) => level === AccessLevel.Read).length;
    const write = levels.filter((level) => level === AccessLevel.Write).length;
    return `${read + write} resources, ${read} read, ${write} write`;
  }, [granted]);

  const applyToVisible = (level: AccessLevel) => {
    const patch = new Map<TStripeApiKeyPermissionResource, AccessLevel>();
    visibleGroups.forEach(({ rows }) =>
      rows.forEach((resource) => patch.set(resource, resolveBulkLevel(resource, level)))
    );
    setLevels(patch);
  };

  return (
    <Stack gap={8}>
      <Inline justify="between" gap={12} wrap={false}>
        <FieldLabel id="stripe-permissions-label">Permissions</FieldLabel>
        <SmallText muted>{summary}</SmallText>
      </Inline>
      <FieldDescription>
        Grant only the access your application needs. The generated key gets exactly these
        permissions.
      </FieldDescription>
      <Card size="sm">
        <div role="group" aria-labelledby="stripe-permissions-label">
          <Stack gap={8}>
            <Inline gap={8} wrap={false}>
              <div className="min-w-0 flex-1">
                <Input
                  icon="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search resources"
                  aria-label="Search Stripe resources"
                />
              </div>
              <ToggleGroup
                type="single"
                aria-label="Show resources"
                value={isGrantedOnly ? "granted" : "all"}
                onValueChange={(next) => {
                  if (next) setIsGrantedOnly(next === "granted");
                }}
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="granted">Granted</ToggleGroupItem>
              </ToggleGroup>
              <Inline gap={4} wrap={false}>
                <SmallText muted>Set all</SmallText>
                {[AccessLevel.None, AccessLevel.Read, AccessLevel.Write].map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!visibleGroups.length}
                    onClick={() => applyToVisible(level)}
                  >
                    {LEVEL_LABELS[level]}
                  </Button>
                ))}
              </Inline>
            </Inline>
            <Separator />
            <div className="max-h-100 overflow-auto">
              {visibleGroups.map(({ name: groupName, resources, rows, grantedCount }) => {
                const isExpanded = !collapsed[groupName] || Boolean(normalizedQuery);
                return (
                  <Stack key={groupName} gap={0}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setCollapsed((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
                      }
                    >
                      <Icon name={isExpanded ? "chev-down" : "chev-right"} />
                      <span className="flex-1 text-start">{groupName}</span>
                      <SmallText muted>
                        {grantedCount} of {resources.length} granted
                      </SmallText>
                    </Button>
                    {isExpanded &&
                      rows.map((resource) => {
                        const level = getLevel(resource, granted);
                        return (
                          <div key={resource.name} className="py-1 ps-8">
                            <Inline justify="between" gap={12} wrap={false}>
                              <div className="min-w-0 truncate">
                                <Text muted={level === AccessLevel.None}>{resource.name}</Text>
                              </div>
                              <ToggleGroup
                                type="single"
                                aria-label={`${groupName} ${resource.name} access`}
                                value={level}
                                onValueChange={(next) => {
                                  if (next) setLevels(new Map([[resource, next as AccessLevel]]));
                                }}
                              >
                                {getLevels(resource).map((option) => (
                                  <ToggleGroupItem key={option} value={option}>
                                    {LEVEL_LABELS[option]}
                                  </ToggleGroupItem>
                                ))}
                              </ToggleGroup>
                            </Inline>
                          </div>
                        );
                      })}
                  </Stack>
                );
              })}
              {!visibleGroups.length && (
                <div className="p-6 text-center">
                  <Text muted>
                    {normalizedQuery
                      ? "No resources match this search."
                      : "No resources granted yet."}
                  </Text>
                </div>
              )}
            </div>
          </Stack>
        </div>
      </Card>
    </Stack>
  );
}
