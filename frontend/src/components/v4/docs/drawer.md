# Drawer

Present a modal panel that opens from a screen edge.

## Choose this component

Choose Drawer for a dismissible edge panel where drag interaction is useful. Use Sheet for a side task without a drag model and Dialog for a centered focused task.

## Usage rules

### drawer-usage

Owner: drawer.

When a drawer can be dismissed by a gesture.

Do: Provide a visible close control and protect a dirty draft through host-controlled open state.

Avoid: Make swipe the only exit or connect a drag gesture to irreversible work.

Why: Gestures need an equivalent discoverable control and must not silently commit work.

Checked by: review only. Look for: Open and close the panel without a swipe, then test a dirty draft. The visible exit works and host dismissal cannot silently lose unsaved input.

Source evidence:
- src/components/v4/ui/drawer.tsx
- src/pages/design-system/examples/drawer/default.tsx

## State guidance

- open: Keep title and dismissal visible within the panel.
- pending: Prevent a host operation from being mistaken for a completed action when the drawer closes.

## Presentation rules

Do: Use the panel for one supporting task.

Avoid: Layer several drawers to imitate page navigation.

Why: Stacked edge panels obscure origin, focus and the remaining task.

## Import and exports

- src/components/v4/ui/drawer.tsx

Exports: Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger. Source TypeScript defines the API.

## Behavior

- DrawerBody owns the shared body inset and bounded scrolling between Header and Footer. It forwards a div ref and native props; Content continues to accept arbitrary children. Use one intentional scroll owner.
- Drawer forwards Vaul's controlled open/onOpenChange, direction and drag behavior; its Content and Overlay portal into the current V4Scope.

## Accessibility

- Provide DrawerTitle and DrawerDescription. Focus stays inside the open drawer and returns to the trigger. Escape inside an open editor closes the editor before the drawer.

## Use cases

- Choose direction from the task layout, give the drawer a title and decide whether dismissal is allowed while the host operation is pending.

## Avoid

- Use a drag gesture as the only close path or allow a pending task to disappear without a defined draft policy.

## Limits

- Drag thresholds and dismissal are Vaul behavior; the host must choose whether a pending task may be dismissed.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Direction

- top: example `placements`, visible label "top drawer".
- right: example `placements`, visible label "right drawer".
- bottom: example `placements`, visible label "bottom drawer".
- left: example `placements`, visible label "left drawer".

### Dismissible

- true: example `placements`, visible label "bottom drawer".
- false: example `behavior`, visible label "Done reviewing".

## Executable examples

### Access request

Save this example at `src/pages/design-system/examples/drawer/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/drawer. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/drawer";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.Drawer autoFocus>
        <UI.DrawerTrigger asChild>
          <Button variant="outline">View request</Button>
        </UI.DrawerTrigger>
        <UI.DrawerContent>
          <UI.DrawerHeader>
            <UI.DrawerTitle>Access request</UI.DrawerTitle>
            <UI.DrawerDescription>Read access requested for 1 hour.</UI.DrawerDescription>
          </UI.DrawerHeader>
          <UI.DrawerFooter>
            <UI.DrawerClose asChild>
              <Button>Close request</Button>
            </UI.DrawerClose>
          </UI.DrawerFooter>
        </UI.DrawerContent>
      </UI.Drawer>
    </div>);
}
```

### Directions

Save this example at `src/pages/design-system/examples/drawer/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/drawer. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/drawer";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["top", "right", "bottom", "left"] as const).map((side) => (<UI.Drawer key={side} direction={side} autoFocus>
          <UI.DrawerTrigger asChild>
            <Button variant="outline">{side} drawer</Button>
          </UI.DrawerTrigger>
          <UI.DrawerContent>
            <UI.DrawerHeader>
              <UI.DrawerTitle>Staging connection</UI.DrawerTitle>
              <UI.DrawerDescription>24 fictional clients with read access.</UI.DrawerDescription>
            </UI.DrawerHeader>
            <UI.DrawerBody>
              <ul>
                {Array.from({ length: 24 }, (_, index) => (<li key={index}>Client {index + 1}: read Staging configuration</li>))}
              </ul>
            </UI.DrawerBody>
            <UI.DrawerFooter>
              <UI.DrawerClose asChild>
                <Button variant="outline">Close connection</Button>
              </UI.DrawerClose>
            </UI.DrawerFooter>
          </UI.DrawerContent>
        </UI.Drawer>))}
    </div>);
}
```

### Bounded review and dismissal policy

Save this example at `src/pages/design-system/examples/drawer/behavior.tsx`; its relative imports are generated for that exact path. States: controlled, overflow.

Registry items used: @infisical/button, @infisical/drawer. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/drawer";

export default function Example() {
  const [open, setOpen] = useState(false);
  return (
    <UI.Drawer open={open} onOpenChange={setOpen} dismissible={false} autoFocus>
      <UI.DrawerTrigger asChild>
        <Button variant="outline">Review grants</Button>
      </UI.DrawerTrigger>
      <UI.DrawerContent className="h-full">
        <UI.DrawerHeader>
          <UI.DrawerTitle>Connection grants</UI.DrawerTitle>
          <UI.DrawerDescription>
            24 fictional grants. Use Done reviewing to dismiss this review.
          </UI.DrawerDescription>
        </UI.DrawerHeader>
        <UI.DrawerBody>
          <ul>
            {Array.from({ length: 24 }, (_, index) => (
              <li key={index}>Client {index + 1}: read Staging configuration</li>
            ))}
          </ul>
        </UI.DrawerBody>
        <UI.DrawerFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done reviewing
          </Button>
        </UI.DrawerFooter>
      </UI.DrawerContent>
    </UI.Drawer>
  );
}
```

### Representative snap points

Save this example at `src/pages/design-system/examples/drawer/snap-points.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/button, @infisical/drawer. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/drawer";

export default function Example() {
  const [snap, setSnap] = useState<number | string | null>(1);
  return (
    <UI.Drawer snapPoints={[0.5, 1]} activeSnapPoint={snap} setActiveSnapPoint={setSnap} autoFocus>
      <UI.DrawerTrigger asChild>
        <Button variant="outline">Adjust review height</Button>
      </UI.DrawerTrigger>
      <UI.DrawerContent style={{ height: "100dvh", maxHeight: "100dvh" }}>
        <UI.DrawerHeader>
          <UI.DrawerTitle>Connection review height</UI.DrawerTitle>
          <UI.DrawerDescription>
            Choose a bounded review height for this local connection.
          </UI.DrawerDescription>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" aria-pressed={snap === 0.5} onClick={() => setSnap(0.5)}>
              Half height
            </Button>
            <Button variant="outline" aria-pressed={snap === 1} onClick={() => setSnap(1)}>
              Full height
            </Button>
            <UI.DrawerClose asChild>
              <Button variant="outline">Close review</Button>
            </UI.DrawerClose>
          </div>
        </UI.DrawerHeader>
      </UI.DrawerContent>
    </UI.Drawer>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#drawer and verify the documented interaction.
