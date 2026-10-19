# Button Group

Join related actions without giving each its own container.

## Choose this component

Choose ButtonGroup to join related actions. Use Tabs for peer panels, ToggleGroup for pressed choices and RadioGroup for one required value.

## Usage rules

### button-group-usage

Owner: button-group.

When several compact tools act on the same resource.

Do: Group Inspect and Compare together, name the group, and use toolbar only when arrow-key focus is intended.

Avoid: Build an All, Reads, Writes view selector from ordinary grouped action buttons.

Why: The shared edge signals related actions. It does not supply a selected-value model, and nonwrapping groups still need a usable narrow layout.

Checked by: review only. Look for: At the narrowest supported width, reach every grouped action. Toolbar arrows move focus among enabled tools without changing a field or pretending to select a peer panel.

Source evidence:
- src/components/v4/ui/button-group.tsx
- src/pages/design-system/examples/button-group/default.tsx

## State guidance

- toolbar: Keep a meaningful group label and allow arrow keys to move among enabled tools.
- narrow: Use a spaced group or an outer wrapping layout when attached actions cannot fit.

## Presentation rules

Do: Group tools by the object they affect.

Avoid: Add a border around unrelated page actions simply to fill a toolbar.

Why: The shared edge implies a relationship that the actions do not have.

Do: Name tools by the actual local operation and keep vertical focus movement aligned with the visible column.

Avoid: Label every tool Action or simulate a completed network check without performing one.

Why: A group communicates related operations and a toolbar adds a specific keyboard axis.

## Import and exports

- src/components/v4/ui/button-group.tsx

Exports: ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants. Source TypeScript defines the API.

## Behavior

- attached joins peer Buttons on a shared edge, so they read as one control: Older and Newer, or a split action. toolbar keeps each Button separate with a 4px gap and one tab stop; arrow keys and Home/End move among enabled actions, and ButtonGroupSeparator splits it into sets with one 1px line. spaced is a wrapping row with an 8px gap. ButtonGroupText is a non-interactive segment at the height of its neighbors. A separator between two outline Buttons is hidden, because their borders already draw the line.

## Accessibility

- Name a toolbar for its action set; use ordinary groups when each button should keep its own tab stop.

## Use cases

- Keep peer sizes aligned and use toolbar only for a named action set that benefits from roving focus; use spaced layout when attached actions cannot fit.

## Avoid

- Mix unrelated action sizes, nest another focus system inside a toolbar or conceal essential actions beyond an unreachable edge.

## Limits

- Toolbar focus visits native button, link and role=button descendants; selection and action effects belong to the host.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- attached: example `default`, visible label "attached".
- toolbar: example `default`, visible label "toolbar".
- spaced: omitted. Layout only: separate Buttons in a wrapping row with an 8px gap, kept for a set that must wrap at narrow widths. It has no join and no keyboard model of its own.

### orientation


- horizontal: omitted. The default. Both examples on this page are horizontal.
- vertical: omitted. The same joins rotated for a narrow side panel: the shared edge moves from left/right to top/bottom and toolbar arrows become up/down.

### composition

- group text: example `default`, visible label "attached".
- separator: example `default`, visible label "toolbar".
- roving focus: example `default`, visible label "toolbar".

## Executable examples

### Attached and toolbar

Save this example at `src/pages/design-system/examples/button-group/default.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @infisical/button, @infisical/button-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "../../../../components/v4/ui/button-group";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ButtonGroup label="Version history">
          <Button variant="outline" icon="chev-left">
            Older
          </Button>
          <ButtonGroupText>v12</ButtonGroupText>
          <Button variant="outline" iconRight="chev-right">
            Newer
          </Button>
        </ButtonGroup>
      </div><figcaption className="text-muted-foreground text-xs">{"attached"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ButtonGroup variant="toolbar" label="Secret actions">
          <Button variant="ghost" icon="copy" iconOnly aria-label="Copy value"/>
          <Button variant="ghost" icon="download" iconOnly aria-label="Download"/>
          <ButtonGroupSeparator />
          <Button variant="ghost" icon="trash" iconOnly aria-label="Delete"/>
        </ButtonGroup>
      </div><figcaption className="text-muted-foreground text-xs">{"toolbar"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#button-group and verify the documented interaction.
