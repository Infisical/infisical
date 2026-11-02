import { useState } from "react";

import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@app/components/v4/patterns/filter-bar";
import { Input } from "@app/components/v4/ui/input";
import { Meta } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleStack } from "../../example-presentation";

type Secret = { key: string; environment: string; tags: string[]; updated: string };
const secrets: Secret[] = [
  { key: "DATABASE_URL", environment: "production", tags: ["db"], updated: "2026-10-20" },
  { key: "STRIPE_API_KEY", environment: "production", tags: ["billing"], updated: "2026-09-02" },
  { key: "REDIS_URL", environment: "staging", tags: ["db", "cache"], updated: "2026-10-18" },
  { key: "JWT_SIGNING_KEY", environment: "production", tags: ["auth"], updated: "2026-06-11" },
  {
    key: "PAYMENTS_WEBHOOK_SIGNING_SECRET_FOR_THE_LEGACY_CHECKOUT_FLOW",
    environment: "development",
    tags: ["billing"],
    updated: "2026-10-01"
  },
  { key: "LOG_LEVEL", environment: "development", tags: [], updated: "2026-03-30" }
];
const fields: FilterBarField[] = [
  {
    key: "environment",
    label: "Environment",
    type: "select",
    options: [
      { value: "production", label: "Production" },
      { value: "staging", label: "Staging" },
      { value: "development", label: "Development" }
    ]
  },
  {
    key: "tags",
    label: "Tag",
    type: "multi-select",
    options: ["auth", "billing", "cache", "db"].map((tag) => ({ value: tag, label: tag }))
  },
  { key: "updated", label: "Last updated", type: "date", defaultMonth: new Date(2026, 9, 1) },
  { key: "key", label: "Key", type: "text", placeholder: "Part of a key" }
];
const matches = (secret: Secret, filter: FilterBarFilter) => {
  const [first] = filter.values;
  if (!first) return true;
  if (filter.field === "environment") return secret.environment === first;
  if (filter.field === "tags") return filter.values.some((tag) => secret.tags.includes(tag));
  if (filter.field === "updated")
    return filter.operator === "after" ? secret.updated > first : secret.updated < first;
  return secret.key.toLowerCase().includes(first.toLowerCase());
};

const Bar = ({ initial, caption }: { initial: FilterBarFilter[]; caption: string }) => {
  const [filters, setFilters] = useState(initial);
  const [query, setQuery] = useState("");
  const shown = secrets.filter(
    (secret) =>
      secret.key.toLowerCase().includes(query.trim().toLowerCase()) &&
      filters.every((filter) => matches(secret, filter))
  );
  return (
    <ExampleCell label={caption} align="stretch">
      <FilterBar
        label="Secret filters"
        fields={fields}
        value={filters}
        onChange={setFilters}
        search={
          <Input
            icon="search"
            aria-label="Search secrets"
            placeholder="Search secrets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      />
      <Meta
        mono={false}
        role="status"
      >{`${shown.length} of ${secrets.length} secrets: ${shown.map((secret) => secret.key).join(", ") || "none"}`}</Meta>
    </ExampleCell>
  );
};

export default function Example() {
  return (
    <ExampleStack>
      <Bar initial={[]} caption="No filters: search and Add filter only" />
      <Bar
        initial={[
          { field: "environment", values: ["production"] },
          { field: "tags", values: ["db", "billing", "auth"] },
          { field: "updated", operator: "after", values: ["2026-07-01"] },
          { field: "key", values: ["_KEY"] }
        ]}
        caption="Four filters, one per field type; the row wraps when it fills"
      />
    </ExampleStack>
  );
}
