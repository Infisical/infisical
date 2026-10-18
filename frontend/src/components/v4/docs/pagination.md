# Pagination

Page ranges, numbered or compact navigation, and manual load more.

## Choose this component

Choose Pagination for a bounded result set with known pages or explicit load-more progress. Use ScrollArea for one locally loaded region.

## Usage rules

### pagination-retained-results

Owner: pagination.

When loading another page can fail.

Do: Keep the loaded rows and exact progress visible while pending, then offer an explicit retry beside the failure.

Avoid: Blank the result area or increment the loaded count when a request starts.

Why: The count describes available results and must wait for successful loading.

Checked by: review only. Look for: Reject the next page, confirm 10 rows remain, retry and confirm 20 rows only after fulfillment.

Source evidence:
- src/components/v4/ui/pagination.tsx

### pagination-usage

Owner: pagination.

When the owner provides onLoadMore for a remote collection.

Do: Update host page or progress state after successful loading and pass loading while the request is pending.

Avoid: Assume a supplied callback automatically advances controlled page state or reuse stale counts after failure.

Why: The host owns fetching and the component cannot infer that new rows arrived.

Checked by: review only. Look for: Reject remote loading and then succeed. Current page/progress changes only with actual host results; boundary controls and loaded/total counts remain truthful.

Source evidence:
- src/components/v4/ui/pagination.tsx
- src/pages/design-system/examples/pagination/default.tsx

### pagination-known-quantity

Owner: pagination.

When a result collection exposes pages or explicit load-more progress.

Do: Choose numbered, compact or more from known data, supply total only when measured and reset the controlled page when page size changes.

Avoid: Invent a record total from pageCount, imply infinite fetching or leave the host page unchanged after a successful onLoadMore.

Why: Navigation labels must describe actual results and progress rather than inferred quantities.

Checked by: review only. Look for: Change page size, load another batch and reach empty data. Controlled state updates, ranges are truthful and pageCount-only usage never invents a total.

Source evidence:
- src/components/v4/ui/pagination.tsx

## State guidance

- boundary: Disable previous on the first page and next on the last page.
- more: Without onLoadMore, More advances the page itself; with onLoadMore, the host advances it.

## Presentation rules

Do: Show the page or loaded progress beside navigation.

Avoid: Use numbered pages when the backend has no stable page count.

Why: The navigation must describe what the data source can actually provide.

## Import and exports

- src/components/v4/ui/pagination.tsx
- src/components/v4/ui/pagination.module.css

Exports: Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis, PaginationProps, paginationPages. Source TypeScript defines the API.

## Behavior

- Controlled or default page, numbered gaps, compact Page n of m and manual more.
- Totals and ranges stay visible. An empty total shows No results and no controls. More hides its button once every result is shown and shows its spinner while loading; numbered and compact show the spinner beside the range.
- The current page is a ghost Button with the shared selected paint, not the primary material. Previous and Next carry chevrons, and drop their labels when the pagination is narrower than 480px. Rows per page is a small v4 Select, labelled by its visible label.
- Page-size change requests page one; native links remain available as composed parts.
- Native anchor refs propagate through previous/next.

## Accessibility

- Named navigation, aria-current page buttons, labelled previous/next and rows-per-page.
- Unavailable page links leave the tab order and do nothing when clicked.

## Use cases

- Choose numbered, compact or more navigation from known result information. Let the host own fetching and controlled progress.

## Limits

- The host owns fetching and must update controlled page/pageSize and loading state.
- pageCount without total can only display Page n of m, never an invented total.
- When onLoadMore is supplied, the host must update page or progress after loading. Without onLoadMore, uncontrolled more advances its own page and reports onPageChange.
- More requests do not fetch automatically or imply infinite scrolling.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- numbered: example `default`, visible label "numbered".
- compact: example `default`, visible label "compact".
- more: example `default`, visible label "more".

### Page ownership

- controlled: example `default`, visible label "numbered".
- defaultPage: example `default`, visible label "compact".

### Total source

- total: example `default`, visible label "numbered".
- pageCount: example `default`, visible label "compact".

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/pagination/default.tsx`; its relative imports are generated for that exact path. States: controlled, loading, keyboard.

Registry items used: @infisical/pagination. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { Pagination } from "../../../../components/v4/ui/pagination";
export default function PaginationExamples() {
    const [page, setPage] = React.useState(2);
    const [size, setSize] = React.useState(25);
    const [shown, setShown] = React.useState(1);
    const [loading, setLoading] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout>>();
    React.useEffect(() => () => clearTimeout(timer.current), []);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Pagination label="Secrets pages" page={page} onPageChange={setPage} total={412} pageSize={size} pageSizeOptions={[10, 25, 50]} onPageSizeChange={setSize}/>
      </div><figcaption className="text-muted-foreground text-xs">{"numbered"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Pagination label="Audit log pages" variant="compact" pageCount={8} defaultPage={3}/>
      </div><figcaption className="text-muted-foreground text-xs">{"compact"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Pagination label="Activity pages" variant="more" page={shown} total={60} pageSize={25} loading={loading} onLoadMore={() => {
            setLoading(true);
            timer.current = setTimeout(() => {
                setShown((current) => current + 1);
                setLoading(false);
            }, 700);
        }}/>
      </div><figcaption className="text-muted-foreground text-xs">{"more"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/navigation-helpers.test.tsx src/pages/design-system/examples/pagination/behavior.test.tsx
- static: npm run type:check
- browser: Verify both themes, platform labels, page boundaries and narrow containers.
