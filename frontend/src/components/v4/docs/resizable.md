# Resizable

Resize adjacent panels using a separator handle.

## Choose this component

Choose Resizable for adjacent work areas that remain usable at their minimum sizes. Use a responsive Grid when the user does not need manual resizing.

## Usage rules

### resizable-usage

Owner: resizable.

When a split should start at half width and stop at one fifth.

Do: Use explicit percentage strings for percentage constraints and choose minimum sizes from the real content; verify both panels at each bound.

Avoid: Copy numeric defaultSize 50 and minSize 20 from an older percentage-based API.

Why: The installed API treats numbers as pixels. Even correct percentages can leave a panel too narrow for its title or controls.

Checked by: review only. Look for: Move the divider to both minimum bounds using keyboard and pointer, then resize the viewport. Both panels and their labels remain readable at those permitted sizes.

Source evidence:
- src/components/v4/ui/resizable.tsx
- src/pages/design-system/examples/resizable/default.tsx

## State guidance

- minimum: Keep the content usable at each permitted limit.
- keyboard: Retain a discoverable handle and verify keyboard resizing as well as dragging.

## Presentation rules

Do: Add a resize handle only when changing the split helps the work.

Avoid: Make every card edge draggable because the library supports it.

Why: Unnecessary handles add interaction without a useful layout choice.

## Import and exports

- src/components/v4/ui/resizable.tsx

Exports: ResizablePanelGroup, ResizablePanel, ResizableHandle. Source TypeScript defines the API.

## Behavior

- Group forwards the installed panel library's orientation and layout callbacks. Panels accept defaultSize/minSize/maxSize; Separator provides drag and keyboard resize behavior.

## Accessibility

- Keep the handle focusable with a visible focus state, announcing its current size and the panel it resizes. Give panel contents useful headings.

## Use cases

- Give panel sizes explicit units, choose minimums from usable content and keep the handle keyboard reachable.

## Avoid

- Treat numeric sizes as percentages, persist impossible values or shrink a form until its actions become unreachable.

## Limits

- The host owns layout persistence and content adaptation. Installed v4 panel sizes use pixels for numbers and explicit units for percentages, such as '40%'.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- horizontal: example `default`, visible label "horizontal".
- vertical: example `default`, visible label "vertical".

### handle

- grip: example `default`, visible label "horizontal".
- no grip: omitted. Dropping the grip leaves the same one-pixel divider and drag target.
- disabled: omitted. A disabled handle is the divider without drag or keyboard resizing.

## Executable examples

### Keyboard and pointer panel sizing

Save this example at `src/pages/design-system/examples/resizable/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/resizable. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../../../components/v4/ui/resizable";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["horizontal", "vertical"] as const).map((orientation) => (<figure key={orientation} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <div className="h-48 w-full">
            <ResizablePanelGroup orientation={orientation}>
              <ResizablePanel defaultSize="50%" minSize="25%" maxSize="75%">
                <div className="min-w-0 p-3 text-sm break-words">Records</div>
              </ResizablePanel>
              <ResizableHandle withHandle/>
              <ResizablePanel minSize="25%">
                <div className="min-w-0 p-3 text-sm break-words">Record details</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div><figcaption className="text-muted-foreground text-xs">{orientation}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#resizable and verify the documented interaction.
