# Progress

Expose determinate or indeterminate progress with numeric semantics.

## Choose this component

Choose Progress for measurable completion or an explicitly indeterminate operation. Use Spinner when only pending activity is known and ProgressSteps for named stages.

## Usage rules

### progress-usage

Owner: progress.

When the operation reports a completed count and total.

Do: Derive value from those counts and expose a readable unit, such as 32 of 80 records.

Avoid: Animate a timer from zero toward 99 percent when the operation reports no completion data.

Why: A percentage claims measurable completion. Unknown duration needs an honest pending state rather than a timer that stalls near completion.

Checked by: review only. Look for: Inspect determinate value/max and an unknown-duration state. Numeric completion derives from real completed work, and unknown progress has no invented percentage.

Source evidence:
- src/components/v4/ui/progress.tsx
- src/pages/design-system/examples/progress/default.tsx

### progress-measured-not-estimated

Owner: progress.

When a task can report completed units or only pending activity.

Do: Supply measured value and max when known, label the quantity and use indeterminate mode when completion is unknown.

Avoid: Animate a made-up percentage toward completion, infer an error from a high value alone or announce completion before the host settles.

Why: A progress indicator represents data about real work rather than decoration or a timer.

Checked by: review only. Look for: Test zero, completion, out-of-range input and indeterminate work. The displayed quantity follows supplied measurements and success follows actual completion.

Source evidence:
- src/components/v4/ui/progress.tsx
- src/pages/design-system/examples/progress/default.tsx

## State guidance

- indeterminate: Use the indeterminate state and explain what is pending.
- complete: Report completion from the actual operation result, not merely a full-looking bar.

## Presentation rules

Do: Show progress near the work it describes.

Avoid: Add multiple progress bars for one operation without distinct units.

Why: Duplicate indicators make it unclear which measure determines completion.

## Import and exports

- src/components/v4/ui/progress.tsx
- src/components/v4/ui/helpers.module.css

Exports: Progress, ProgressSteps. Source TypeScript defines the API.

## Behavior

- Progress clamps its ARIA value while preserving explicit over-limit copy. It supports automatic tone, indeterminate activity and a ProgressSteps companion.

## Accessibility

- Name the operation. Indeterminate progress omits a value, and visible over-limit copy explains a value beyond the bound.

## Use cases

- Use determinate progress for measured units and indeterminate activity when the host cannot report completion.

## Limits

- The owner supplies measured progress; indeterminate mode communicates activity without estimating completion or elapsed time.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### tone


- ink: omitted. The bar above uses ink; its caption names the measure, not the tone.
- warn: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "warn".
- bad: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "bad".
- auto: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "auto".

### boundary


- indeterminate: omitted. value={null} shows a moving band with no number; the progress fixture test renders it as "Checking connection".
- 0: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 0%".
- 79: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 79%".
- 80: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 80%".
- 100: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 100%".
- 112: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 112%".

### steps


- first: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "First stage".
- middle: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Middle stage".
- last: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Last stage".
- complete: omitted. Cut to keep the page to the essentials; the progress fixture test renders it as "Complete".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Bar and stages

Save this example at `src/pages/design-system/examples/progress/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/progress. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Progress, ProgressSteps } from "../../../../components/v4/ui/progress";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Progress label="Imported secrets" value={32} max={80} valueLabel="32 / 80"/>
      <ProgressSteps label="Import stages" steps={["Connect", "Validate", "Import"]} current={1}/>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#progress and verify the documented interaction.
