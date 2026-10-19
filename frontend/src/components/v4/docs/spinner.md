# Spinner

Show the Infisical pixel mark while real work remains pending.

## Choose this component

Choose Spinner for any pending activity: bare inside an action, labelled for a region, page size for a page. Use Progress for measurable completion.

## Usage rules

### spinner-usage

Owner: spinner.

When a saving button already announces its pending label.

Do: Keep the embedded spinner decorative so the same operation is not announced twice.

Avoid: Expose a second live loading message on the icon beside Saving changes.

Why: Duplicate status announcements repeat one operation without new information.

Checked by: review only. Look for: Inspect a pending action's accessibility output and reduced-motion rendering. One meaningful pending announcement remains without a duplicate announcement from its decorative mark.

Source evidence:
- src/components/v4/ui/spinner.tsx
- src/pages/design-system/examples/spinner/default.tsx

### spinner-pending-region

Owner: spinner.

When a request for a region takes longer than its initial optimistic delay.

Do: Keep the label tied to that request, set delay to avoid a flash, and unmount the spinner when the request succeeds or fails.

Avoid: Continue the animation after failure or imply a percentage the request does not report.

Why: Activity indicates outstanding work, not completion or success.

Checked by: src/components/v4/ui/brand-runtime.test.tsx. The delayed spinner shows nothing before its delay, then its label, and leaves no timer after unmount.

Source evidence:
- src/components/v4/ui/spinner.tsx
- src/pages/design-system/examples/spinner/default.tsx

## State guidance

- pending: Show the mark only while real work is outstanding. Name the work, such as Loading environments, where the region lacks its own status.
- reduced-motion: Keep the pending meaning understandable when animation is reduced.

## Presentation rules

Do: Keep indicator size subordinate to the action it accompanies and use one indicator per pending region.

Avoid: Turn a compact spinner into a large decorative page centerpiece or mount several synchronized spinners around one operation.

Why: Indicator scale should reflect the affected region rather than add visual drama.

## Import and exports

- src/components/v4/ui/spinner.tsx
- src/components/v4/ui/runtime.module.css

Exports: Spinner, SpinnerSize. Source TypeScript defines the API.

## Behavior

- Inline, base and page sizes. Without label the mark stands alone and is decorative. With label it shows that text beside or under the mark inside one polite status.
- size="page" centres the mark and label in the available region and may add a short description under the label. delay holds the whole indicator back for that many milliseconds, so a fast request never flashes it, and cancels when unmounted.
- The ref reaches the svg mark. className and other props reach the outer element: the svg without a label, the status wrapper with one.

## Accessibility

- With label, one polite status contains the label and the mark is hidden from assistive technology; without one the mark is decorative. With reduced motion the mark stops animating.

## Use cases

- Mount Spinner only while work is outstanding. Use inline inside a control or line that already supplies context, a labelled base spinner for a pending region, and page size for a whole empty page. Set delay to avoid brief flashes and replace it with the result or recovery on settlement.

## Avoid

- Name both a decorative spinner and its busy parent with repeated announcements, leave a delayed spinner scheduled after unmount, or use a timer to imply the request completed.

## Limits

- Spinner communicates activity only. The owner controls when loading starts and ends; description is shown only at page size and only with a label. Do not use animation duration to estimate request completion.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- inline: example `default`, visible label "inline".
- base: example `default`, visible label "base".
- page: example `default`, visible label "page".

### delay


- immediate: omitted. The default: every specimen here starts at once.
- delayed: omitted. A delayed spinner renders nothing until the delay passes, so a static specimen would be empty. brand-runtime.test.tsx exercises it with fake timers.

## Executable examples

### Spinner

Save this example at `src/pages/design-system/examples/spinner/default.tsx`; its relative imports are generated for that exact path. States: loading.

Registry items used: @infisical/spinner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Spinner } from "../../../../components/v4/ui/spinner";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Spinner />
        </div><figcaption className="text-muted-foreground text-xs">{"inline"}</figcaption></figure>
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Spinner size="base" label="Loading connections"/>
        </div><figcaption className="text-muted-foreground text-xs">{"base"}</figcaption></figure>
      </div>
      <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <div className="-mt-5 -mb-10">
            <Spinner size="page" className="w-fit" label="Loading connections" description="Fetching provider configuration"/>
          </div>
        </div><figcaption className="text-muted-foreground text-xs">{"page"}</figcaption></figure>
      </div>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/brand-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#spinner and verify the documented interaction.
