# Filter bar

Search plus an Add filter menu; each applied filter becomes a removable chip that opens its own value picker.

## Choose this component

Choose FilterBar for lists with three or more filter fields. Keep a single Select or ToggleGroup beside the search when there is one filter people always use.

## Usage rules

### filter-bar-host-filters

Owner: filter-bar.

When a FilterBar sits above a table or list.

Do: Filter the rows from the reported filters, ignore a filter with no values and show the matching count.

Avoid: Render chips that do not change the rows, or treat an empty chip as matching nothing.

Why: A chip that does not narrow the list breaks trust in every other filter.

Checked by: review only. Look for: Apply two filters and check the row count drops to rows that match both.

Source evidence:
- src/pages/design-system/examples/filter-bar/default.tsx

### filter-bar-focus-after-remove

Owner: filter-bar.

When a chip is removed by its x button.

Do: Let FilterBar move focus to the neighboring chip or Add filter.

Avoid: Unmount the bar or rebuild chips with new keys, which drops focus to the page.

Why: Keyboard and screen reader users lose their place when focus falls to the body.

Checked by: src/components/v4/patterns/filter-bar.test.tsx. Removes the first of two chips and expects focus on the remaining chip.

Source evidence:
- src/components/v4/patterns/filter-bar.tsx

## State guidance

- empty: Only search and Add filter; no chip row is drawn.
- pending value: A newly added chip reads is any with its picker open until a value is chosen.

## Presentation rules

Do: Write the chip as a sentence: Expiration date before 2026-12-01.

Avoid: Show a bare value such as 2026-12-01 or a count such as Status (2).

Why: People read the field and the comparison without opening the picker.

## Import and exports

- src/components/v4/patterns/filter-bar.tsx
- src/components/v4/patterns/filter-bar.module.css

Exports: FilterBar, describeFilter. Source TypeScript defines the API.

## Behavior

- Add filter opens a menu of the host's fields. A field already applied stays in the menu, disabled, with Already applied as its reason.
- Choosing a field adds its chip and opens that chip's picker at once. Closing a picker that still has no value removes the chip.
- Select fields pick one value, multi-select fields pick several, date fields pick Before or After plus a day, and text fields match a typed fragment. Every change calls onChange immediately; there is no Apply step.
- Each chip is an outline ButtonGroup: the value button reads field, verb and value (Status is Active or Renewed), and the x button removes it.
- Chips wrap onto more lines as the row fills, and Clear filters follows the last chip.
- The search slot fills the first row; the actions slot sits after Add filter for list tools such as Columns and Export.

## Accessibility

- The bar is a search landmark named by label, and the chips are a list named Applied filters, so the count is announced.
- Each chip is a group named after its field. Its value button is named field, verb and value, and its remove button is named Remove <field> filter.
- Removing a chip moves focus to the next chip, else the previous one, else Add filter. Clear filters and a picker closed empty also return focus to Add filter.

## Use cases

- Use FilterBar when a list has more filterable fields than fit as always-visible selects, or when most people filter by one or two of them.

## Avoid

- Keep a row of always-visible selects next to the search once a list has more than two filter fields.

## Limits

- The host owns filtering: FilterBar reports field, operator and values and never filters rows itself.
- One chip per field. Metadata key and value pairs and number ranges are not supported field types.
- Date values are local calendar days as YYYY-MM-DD; time of day is not offered.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### field type

- select: example `default`, visible label "Four filters, one per field type; the row wraps when it fills".
- multi-select: example `default`, visible label "Four filters, one per field type; the row wraps when it fills".
- date: example `default`, visible label "Four filters, one per field type; the row wraps when it fills".
- text: example `default`, visible label "Four filters, one per field type; the row wraps when it fills".

### applied count

- none: example `default`, visible label "No filters: search and Add filter only".
- several: example `default`, visible label "Four filters, one per field type; the row wraps when it fills".

## Executable examples

### Empty and with filters applied

Save this example at `src/pages/design-system/examples/filter-bar/default.tsx`; its relative imports are generated for that exact path. States: default, empty, overflow, keyboard.

Registry items used: @infisical/filter-bar, @infisical/input, @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { FilterBar, type FilterBarField, type FilterBarFilter } from "../../../../components/v4/patterns/filter-bar";
import { Input } from "../../../../components/v4/ui/input";
import { Meta } from "../../../../components/v4/ui/text";
type Secret = {
    key: string;
    environment: string;
    tags: string[];
    updated: string;
};
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
    if (!first)
        return true;
    if (filter.field === "environment")
        return secret.environment === first;
    if (filter.field === "tags")
        return filter.values.some((tag) => secret.tags.includes(tag));
    if (filter.field === "updated")
        return filter.operator === "after" ? secret.updated > first : secret.updated < first;
    return secret.key.toLowerCase().includes(first.toLowerCase());
};
const Bar = ({ initial, caption }: {
    initial: FilterBarFilter[];
    caption: string;
}) => {
    const [filters, setFilters] = useState(initial);
    const [query, setQuery] = useState("");
    const shown = secrets.filter((secret) => secret.key.toLowerCase().includes(query.trim().toLowerCase()) &&
        filters.every((filter) => matches(secret, filter)));
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <FilterBar label="Secret filters" fields={fields} value={filters} onChange={setFilters} search={<Input icon="search" aria-label="Search secrets" placeholder="Search secrets" value={query} onChange={(event) => setQuery(event.target.value)}/>}/>
      <Meta mono={false} role="status">{`${shown.length} of ${secrets.length} secrets: ${shown.map((secret) => secret.key).join(", ") || "none"}`}</Meta>
    </div><figcaption className="text-muted-foreground text-xs">{caption}</figcaption></figure>);
};
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Bar initial={[]} caption="No filters: search and Add filter only"/>
      <Bar initial={[
            { field: "environment", values: ["production"] },
            { field: "tags", values: ["db", "billing", "auth"] },
            { field: "updated", operator: "after", values: ["2026-07-01"] },
            { field: "key", values: ["_KEY"] }
        ]} caption="Four filters, one per field type; the row wraps when it fills"/>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npx vitest run src/components/v4/patterns/filter-bar.test.tsx
- browser: npm run dev; open /design-system#filter-bar, add, edit and remove filters by keyboard.
