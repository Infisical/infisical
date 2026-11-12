# Button

Trigger a named action with a clear emphasis and pending state.

## Choose this component

Choose Button for an action. Use a native link for a destination, Toggle for a persistent pressed choice and Switch for an immediate setting.

## Usage rules

### button-usage

Owner: button.

When a form has one save action and several supporting actions.

Do: Use the ink primary Button for Save changes, use outline or ghost for Review draft and Discard, and keep the button's size and name while saving.

Avoid: Give every action the strongest emphasis, paint Save changes with the accent, repaint the shared material in caller styles or replace Save changes with an unlabeled spinner.

Why: Emphasis identifies the next action, while a stable name preserves task context during pending work.

Checked by: review only. Look for: Toggle an explicitly supplied loading boolean. The action keeps its name and bounds, rejects repeat activation and retains visible keyboard focus in both themes.

Source evidence:
- src/components/v4/ui/button.tsx
- src/pages/design-system/examples/button/default.tsx

### button-size-and-state-comparison

Owner: button.

When primary and supporting actions appear beside one another.

Do: Use the supported size recipes for peer actions and keep the shared paint. Passing loading never changes padding, so pass it whenever the operation can become pending.

Avoid: Compensate for a borderless appearance with caller padding, add a new gradient or remove the action label while loading.

Why: A shared size owns border-inclusive geometry; state and emphasis should not move the neighboring actions.

Checked by: review only. Look for: Compare filled and outline peers at every supported text size, then enter pending and keyboard focus. Their outer heights and alignment remain stable without caller geometry patches.

Source evidence:
- src/components/v4/ui/button.tsx
- src/pages/design-system/examples/button/default.tsx

### button-quiet-link

Owner: button.

When a link Button names a record inside a table row that opens it in a sheet or dialog, among many such names.

Do: Pass variant="link" with underline="hover", so the name reads as plain text at rest and underlines on hover and keyboard focus.

Avoid: Underline every row's name at rest, or drop the link variant for a ghost or plain button that never shows it can be opened.

Why: A column of underlined names turns the table into a wall of links; the quiet link keeps rows calm and still signals the target when the pointer or focus reaches it.

Checked by: review only. Look for: Hover and Tab to a row's name in a sheet-opening table: no underline at rest, an underline on hover and on keyboard focus.

Source evidence:
- src/components/v4/ui/button.tsx
- src/pages/design-system/examples/button/default.tsx

### button-cursor

Owner: button.

When a Button, Toggle or other styled control sits beside text links.

Do: Leave the cursor to the component: styled controls show the default cursor and only the link variant, text anchors, RowLink and CardLink show the pointer.

Avoid: Add cursor: pointer or a cursor-pointer class to a Button, a trigger or a Button that renders an anchor so it feels clickable.

Why: The pointer marks a link. A styled control already reads as actionable through its grounds, and a pointer on it blurs which targets navigate.

Checked by: review only. Look for: Hover each variant, including an asChild anchor: only link shows the pointer. npm run ui:lint (cursor-pointer) flags any cursor: pointer or cursor-pointer outside a link selector.

Source evidence:
- src/components/v4/ui/button-geometry.module.css
- src/components/v4/ui/button-material.module.css

### button-row-icon-size

Owner: button.

When an icon-only action sits in a table row, a field or a toolbar.

Do: Use icon-row for actions in a Table or DataTable row, in the actions tail (DataTable rowActions or RowActions). Keep icon-xs and icon-sm for actions nested in a field or block (InputGroup reveal and copy, Code and Snippet copy, a combobox clear) and for overlay chrome, and icon for a standalone toolbar action.

Avoid: Put icon-xs or icon-sm in a table row, or icon-row in a field slot, a toolbar or a dialog header.

Why: Row actions share one glyph with the row's indicators and one target that fits the 40px row; field actions must fit their host slot, so resizing one must not move the other.

Checked by: review only. Look for: Measure a row action and a field action on the same page: the row action is a 28px box with a 16px glyph, the field action keeps its 24 or 28px box with a 12 or 14px glyph.

Source evidence:
- src/components/v4/ui/button.tsx
- src/components/v4/ui/button-geometry.module.css

### button-trigger-layout

Owner: button.

When a Button opens a menu, popover or picker and shows a value with a chevron, such as an environment picker or an account menu.

Do: Pass layout="trigger" and give the Button its width; the label starts, truncates and the chevron sits at the end.

Avoid: Put iconRight="chev-down" on a plain Button, or add justify-content: space-between to its class.

Why: A plain Button centers its content, so in a fixed width the value and chevron float in the middle while a Select beside it starts its label at the edge.

Checked by: review only. Look for: Open the menu in the Trigger layout example at a fixed width: the value starts at the same inset as the Select beside it and the chevron ends at its edge. npm run ui:lint (trigger-start-aligned) flags the plain Button form.

Source evidence:
- src/components/v4/ui/button.tsx
- src/components/v4/ui/button-geometry.module.css
- src/pages/design-system/examples/button/trigger-layout.tsx

### button-disabled-reason

Owner: button.

When an action is blocked by a permission, a plan or a missing prerequisite.

Do: Keep the Button in place and pass disabledReason with the reason in one sentence, such as Only project admins can rotate this key.

Avoid: Hide the action, pass disabled alone with no reason, or wrap a natively disabled Button in a span and a Tooltip to show why.

Why: A natively disabled button cannot take focus, so keyboard users never reach a reason hung on it; disabledReason keeps it focusable and blocks activation in one place.

Checked by: src/components/v4/ui/button.test.tsx. Clicks a submit Button with a disabledReason inside a form; neither onClick nor the form's submit runs, and the button is focusable with aria-disabled and the reason as its aria-description.

Source evidence:
- src/components/v4/ui/button.tsx
- src/components/v4/ui/button.test.tsx
- src/pages/design-system/examples/button/states.tsx

## State guidance

- pending: Pass loading={pending}. The spinner overlays the button, so its width and padding stay the same whether loading is absent, false or true. With a leading icon the spinner replaces the icon and the label stays readable. Report success only after the actual operation completes.
- disabled: Pass disabledReason when the person can learn why the action is blocked; the Button stays focusable and its tooltip says why. Use native disabled only when the reason is already visible beside the control.

## Presentation rules

Do: Write action labels that name the outcome.

Avoid: Show default, primary, outline and ghost as the human-facing action labels.

Why: Variant names belong in comparison captions. Product action labels identify the outcome.

## Import and exports

- src/components/v4/ui/button.tsx
- src/components/v4/ui/button-material.module.css
- src/components/v4/ui/button-geometry.module.css
- src/components/v4/ui/button.test.tsx
- src/components/v4/tokens.json

Exports: Button, buttonVariants. Source TypeScript defines the API.

## Behavior

- Primary (and default, its alias) is the ink fill with an on-ink label at 600 for the one main action in a view or dialog; hover moves to text2. Accent keeps the light accent face (one yellow in both themes) with owned inset illumination and an on-accent label in both themes, for a page's one primary create action in its header or toolbar and for approval and grant moments, never as a second primary. Ghost hover is the shared hover overlay (ink at hover-mix: 6% light, 12% dark), so it shows on raised surfaces. destructive is the solid danger recipe: bad-fill fill and border with a white on-bad label at 600 in both themes, bad-hover on hover, and the neutral disabled control (line-soft fill, faint label) when disabled; like primary and accent, it keeps its fill while loading. link is ink text with a 1px underline at a 3px offset; hover moves to text2 with a 2px underline and never adds a background. underline hover makes a quiet link: no underline at rest, and the same underline on hover and on keyboard focus-visible; the default, always, keeps it at rest. Loading morphs the label into the spinner inside the same box: with loading set, the whole label group (icons included) fades, shrinks and blurs out on duration-moderate while the pixel Spinner fades in centered over it, and the reverse when loading ends. The idle spinner is absolutely positioned, so a button with loading={false} lays out exactly like one without it and never shifts or resizes; the spinner never sits beside an icon. While loading the accessible name stays, aria-busy is set and activation is inert. Reduced motion is a short opacity fade. Pressing never moves or resizes the box: the label and its icons scale to 0.97 inside it and spring back, the pressed fill stays on the box, and reduced motion keeps the fill only. The selected paint follows only selected (aria-pressed true), data-state on and aria-current page, never aria-expanded, so a disclosure button keeps aria-expanded and looks as it does at rest. A popup trigger (aria-haspopup) takes its open paint while its menu or popover is open, from Radix's data-state open, or from aria-expanded on that trigger because a wrapping Tooltip overwrites data-state. link has no control height or padding: its box is its text, it sits on the surrounding baseline, and only the focus ring extends past it. Native button and slot composition preserve interaction semantics.
- The text sizes are 32px (default, with sm as its alias), 36px (md) and 40px (lg), with 10, 14 and 16px insets and the shared 14px label. icon matches default at 32px and icon-lg matches lg at 40px; iconOnly makes any text size square. xs, icon-xs (24px) and icon-sm (28px) are nested and chrome sizes. icon-row is the table row action: a size-target-row (28px) box with a size-glyph (16px) glyph, separate from icon-sm so field and nested actions keep their 12 and 14px glyphs. Nested control actions consume the host slot instead of inheriting a standalone action's geometry. Size names do not guarantee a touch target.
- Every variant except link keeps the default cursor, also when asChild renders an anchor: its fill, border or hover ground already shows that it acts. link takes the pointer cursor, like any text link.
- layout trigger is for a Button that opens a menu, popover or picker and shows its current value: the label sits at the start and truncates with an ellipsis, and a 16px chevron (chev-down, or iconRight) sits at the end, muted on outline, secondary and ghost. Insets match SelectTrigger at each size (10, 12 and 14px at default, md and lg) with the same 6px gap, so a picker Button and a Select read as one family. Give it a width; without one it hugs its label.
- cornerBadge pins a small Badge to the top-right corner: its end edge sits on the button's end edge and its middle on the top border, so it straddles the border without changing the button's size or hit area. It takes no pointer events, stays put while the label presses or loads, and sits on a surface ground so a translucent tone never shows the border through it.

## Accessibility

- Use a real button for an action and asChild with an anchor for navigation. Name icon-only buttons. Native disabled removes activation, while loading remains focusable and exposes busy/disabled semantics.
- disabledReason disables the action without native disabled: the button sets aria-disabled, stays in the tab order, shows the reason in a Tooltip on hover and keyboard focus, and carries it as aria-description. Click, Enter, Space and form submission are blocked, so a submit Button with a reason never submits its form. It dims like native disabled, and the ink, accent and destructive variants keep their own disabled recipe.
- cornerBadge renders inside the button, so its text joins the accessible name after the label, as in Continue with Google Last used. Write it as a short word or two that reads well in that position.
- The rendered button defaults to type button, so a Button inside a form never submits it by accident. Set type submit on the one Button that submits; an explicit type always wins. With asChild, Button sets no type and forwards only the one you pass, so an anchor child never gets a type attribute.

## Use cases

- Choose emphasis with variant and geometry with size. default and primary share the ink fill and accent is the yellow fill for a page's create action; default and sm are size aliases. Give a pending action a leading icon when its label must stay visible while it works.

## Limits

- The owner runs the operation and updates loading. Button does not start requests, show result notifications or impose a destructive confirmation.
- Button has no read-only prop. Use disabled for unavailable actions, or show read-only content without an action.
- cornerBadge is not portaled: it overhangs the button's top edge by half the small Badge height (size-badge-sm / 2) and stays within its inline edges. An ancestor with overflow hidden clips that half unless it leaves that much room above the button. Pass a Badge with size sm; Button does not resize it.
- With disabledReason set the reason replaces any label tooltip. Do not wrap the Button in another Tooltip while it has a reason: pass the wrapper content only while the action is enabled, as in Tooltip content={reason ? undefined : label}.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- default: example `default`, visible label "default".
- accent: example `default`, visible label "accent".
- outline: example `default`, visible label "outline".
- ghost: example `default`, visible label "ghost".
- destructive: example `default`, visible label "destructive".
- link: example `default`, visible label "link".
- primary: omitted. Default is the alias of primary: the same ink fill.
- secondary: omitted. A tint-filled peer of outline for dense toolbars. It adds no new decision to the comparison.
- danger-ghost: omitted. The quiet form of destructive for a row action next to other ghost actions. Same red text as destructive without the fill.

### link underline

- always: example `default`, visible label "link".
- hover: example `default`, visible label "link, underline on hover".

### size

- default: example `sizes`, visible label "default, sm".
- sm: example `sizes`, visible label "default, sm"; alias of default.
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".
- icon: example `sizes`, visible label "icon".
- icon-lg: example `sizes`, visible label "icon-lg".
- xs: omitted. 24px, below the 32/36/40 control scale. Reserved for actions nested inside another control, such as a chip or a field slot.
- icon-xs: omitted. 24px nested icon action, the icon partner of xs. Same reason as xs.
- icon-sm: omitted. 28px icon action for overlay chrome such as a dialog or sheet close. It sits inside a header, never beside text Buttons.
- icon-row: omitted. 28px target with a 16px glyph for table row actions. It only makes sense in a table's actions tail, the sticky last column, so the Table row actions example shows it.

### icon placement

- none: example `default`, visible label "outline".
- leading: example `composition`, visible label "Leading icon".
- trailing: example `composition`, visible label "Trailing icon".
- icon-only: example `composition`, visible label "Icon only".

### state and behavior

- idle: example `states`, visible label "Idle".
- disabled: example `states`, visible label "Disabled".
- disabled with reason: example `states`, visible label "Disabled with reason".
- pending: example `states`, visible label "Loading".
- pending with icon: example `states`, visible label "Loading with icon".
- controlled loading=false: example `states`, visible label "Idle".
- slotted anchor: example `composition`, visible label "Trailing icon".
- invalid: omitted. aria-invalid draws the red control border. A Button is rarely the invalid control; the field it opens carries the error.
- selected: omitted. selected sets aria-pressed and paints the shared selected recipe. Toggle shows that recipe; use Toggle for a persistent pressed choice.
- read-only: omitted. Button has no read-only prop. Read-only content does not imply an available action; unavailable actions use disabled.
- local result: omitted. Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller.
- local failure and retry: omitted. Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller.

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/button/default.tsx`; its relative imports are generated for that exact path. States: default, loading.

Registry items used: @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useRef, useState } from "react";

import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button
            loading={pending}
            onClick={() => {
              setPending(true);
              timer.current = setTimeout(() => setPending(false), 900);
            }}
          >
            Save changes
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="accent">Grant for 1 hour</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"accent"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="outline">Edit settings</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"outline"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="ghost">Cancel</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"ghost"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="destructive">Delete project</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"destructive"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="link" asChild>
            <a href="#input">Input guide</a>
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"link"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="link" underline="hover" asChild>
            <a href="#table">Table guide</a>
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"link, underline on hover"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Sizes

Save this example at `src/pages/design-system/examples/button/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="outline">Save changes</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default, sm"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button size="md" variant="outline">
            Save changes
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"md"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button size="lg" variant="outline">
            Save changes
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"lg"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button size="icon" variant="outline" icon="settings" iconOnly aria-label="Settings" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"icon"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button size="icon-lg" variant="outline" icon="settings" iconOnly aria-label="Settings" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"icon-lg"}</figcaption>
      </figure>
    </div>
  );
}
```

### Loading and disabled

Save this example at `src/pages/design-system/examples/button/states.tsx`; its relative imports are generated for that exact path. States: default, loading, disabled, keyboard.

Registry items used: @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button loading={false}>Save changes</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Idle"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button loading>Save changes</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Loading"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="outline" icon="plus" loading>
            Add connection
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Loading with icon"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button disabled>Save changes</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button disabledReason="Only project admins can rotate this key.">Rotate key</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Disabled with reason"}</figcaption>
      </figure>
    </div>
  );
}
```

### Icons and links

Save this example at `src/pages/design-system/examples/button/composition.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button icon="plus">Add connection</Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Leading icon"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="outline" iconRight="chev-right" asChild>
            <a href="#pagination">Continue</a>
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Trailing icon"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button variant="ghost" size="icon" icon="eye" iconOnly aria-label="Show preview" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Icon only"}</figcaption>
      </figure>
    </div>
  );
}
```

### Inside a form

Save this example at `src/pages/design-system/examples/button/form-type.tsx`; its relative imports are generated for that exact path. States: default, success.

Registry items used: @cipher/button, @cipher/field, @cipher/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";

export default function Example() {
  const [name, setName] = useState("payments-api");
  const [saved, setSaved] = useState(0);
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved((count) => count + 1);
          }}
        >
          <Field label="Identity name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setName(`identity-${Date.now() % 10000}`)}
            >
              Generate name
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
            <span role="status" className="text-sm">
              {saved ? `Saved ${saved} ${saved === 1 ? "time" : "times"}` : "Not saved yet"}
            </span>
          </div>
        </form>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Generate keeps the default type; Save sets type submit"}
      </figcaption>
    </figure>
  );
}
```

### Trigger layout

Save this example at `src/pages/design-system/examples/button/trigger-layout.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/dropdown-menu, @cipher/select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "../../../../components/v4/ui/dropdown-menu";
import { Select } from "../../../../components/v4/ui/select";

const environments = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "preview", label: "Preview for pull request 4821, payments-api checkout redesign" }
];

function EnvironmentMenu({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const label = environments.find((environment) => environment.value === value)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          layout="trigger"
          className="w-56"
          aria-label={`Environment: ${label}`}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
          {environments.map((environment) => (
            <DropdownMenuRadioItem key={environment.value} value={environment.value}>
              {environment.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <EnvironmentMenu initial="production" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Button layout trigger"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="w-56">
            <Select aria-label="Environment" options={environments} defaultValue="production" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"SelectTrigger"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <EnvironmentMenu initial="preview" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Long value truncates"}</figcaption>
      </figure>
    </div>
  );
}
```

### Corner badge

Save this example at `src/pages/design-system/examples/button/corner-badge.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/badge, @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Button
            variant="outline"
            size="md"
            cornerBadge={
              <Badge tone="accent" size="sm">
                Last used
              </Badge>
            }
          >
            Continue with Google
          </Button>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"outline with a Last used Badge"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#button and verify the documented interaction.
