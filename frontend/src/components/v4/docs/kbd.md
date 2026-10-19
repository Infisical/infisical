# Keyboard shortcut

Keyboard key caps with platform-aware modifiers and readable sequences.

## Choose this component

Choose Kbd or KeyCombo for an actual keyboard binding or a labeled key-notation specimen. Register task-action shortcuts in the host; notation and platform comparisons do not imply available commands. Use ordinary Text for an action name.

## Usage rules

### kbd-usage

Owner: kbd.

When a command uses platform modifiers or a sequence of chords.

Do: Show one key cap per key and keep chord versus sequence order explicit.

Avoid: Render a shortcut that is not bound or join a sequence into an ambiguous single chord.

Why: The display describes behavior but does not implement it.

Checked by: review only. Look for: Compare the displayed chord/sequence with the host's actual binding and platform. Each key is intelligible and only registered bindings are presented as available actions.

Source evidence:
- src/components/v4/ui/kbd.tsx
- src/pages/design-system/examples/kbd/default.tsx

### kbd-notation-and-binding

Owner: kbd.

When kbd presents an available action hint or an explicitly labeled notation specimen.

Do: Bind actual task-action hints in their active host context. Label notation, platform, literal-plus and sequence specimens as syntax demonstrations; they do not need registered commands. Choose explicit platform for deterministic comparisons.

Avoid: Advertise an unavailable action shortcut, add meaningless commands to notation specimens or apply prose cleanup to literal plus signs and sequence notation.

Why: An action hint promises behavior, while a labeled specimen teaches notation. Both preserve exact key syntax without inventing application commands.

Checked by: review only. Look for: Invoke each available task-action hint in its intended context, then type in an editable field and test pending or disabled states where applicable. Check labeled notation, platform, literal-plus and sequence specimens for correct key syntax and clear specimen labeling; do not require or add commands for those comparisons.

Source evidence:
- src/components/v4/ui/kbd.tsx
- src/pages/design-system/examples/kbd/default.tsx

## State guidance

- platform: Use the correct modifier representation for the host platform.
- sequence: Keep each chord distinguishable so the order can be followed.

## Presentation rules

Do: Place shortcut hints beside the action they invoke.

Avoid: Scatter decorative key caps through prose with no available command.

Why: Shortcut styling implies a usable interaction and should not be ornamental.

## Import and exports

- src/components/v4/ui/kbd.tsx
- src/components/v4/ui/kbd.module.css

Exports: Kbd, KbdGroup, KeyCombo, shortcutSteps. Source TypeScript defines the API.

## Behavior

- String, array and sequence bindings render one cap per key.
- mod becomes Command on Apple and Control elsewhere; explicit platform supports documentation.
- Existing composed Kbd children and native element refs remain supported.

## Accessibility

- The shortcut group announces key names rather than symbol glyphs.
- Displayed caps are hidden from assistive technology behind one accessible group name.

## Use cases

- Use key caps for a real action hint or an explicitly labeled notation, platform, literal-plus or sequence specimen. KbdGroup is a plain inline wrapper, so prose inside it keeps the surrounding font. Preserve key notation and choose platform deliberately. Specimens that teach syntax do not need registered commands.

## Limits

- Kbd only displays bindings. The host must actually register them.
- Automatic platform detection uses navigator.platform in this client application. Use an explicit platform for deterministic server rendering.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size


- md: omitted. The one key cap size, 20px. Every example on this page uses it.
- sm: omitted. Alias of md. The 2px smaller cap could not be told apart, so both render 20px.

### platform

- mac: example `sizes`, visible label "mac".
- other: example `sizes`, visible label "other".
- auto: example `default`, visible label "Chord in a sentence".

### input shape

- string: example `default`, visible label "Chord in a sentence".
- combination array: example `sizes`, visible label "mac".
- sequence array: example `default`, visible label "Sequence".
- literal plus: omitted. keys="+" or "Ctrl++" renders a Plus cap. It is a parsing case, covered by the component test.

## Executable examples

### Shortcuts in context

Save this example at `src/pages/design-system/examples/kbd/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/input, @infisical/kbd. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Input } from "../../../../components/v4/ui/input";
import { Kbd, KbdGroup } from "../../../../components/v4/ui/kbd";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <p>
          Search with <Kbd keys="mod+K"/>
        </p>
      </div><figcaption className="text-muted-foreground text-xs">{"Chord in a sentence"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <p>
          Go to secrets <Kbd keys={[["g"], ["s"]]}/>
        </p>
      </div><figcaption className="text-muted-foreground text-xs">{"Sequence"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <KbdGroup>
          <Kbd>enter</Kbd>
          <span>confirms</span>
          <Kbd>esc</Kbd>
          <span>cancels</span>
        </KbdGroup>
      </div><figcaption className="text-muted-foreground text-xs">{"Key legend"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Input aria-label="Filter secrets" placeholder="Filter by name" kbd="mod+K"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Input hint"}</figcaption></figure>
    </div>);
}
```

### Platforms

Save this example at `src/pages/design-system/examples/kbd/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/kbd. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Kbd } from "../../../../components/v4/ui/kbd";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Kbd keys={["mod", "shift", "p"]} platform="mac"/>
      </div><figcaption className="text-muted-foreground text-xs">{"mac"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Kbd keys={["mod", "shift", "p"]} platform="other"/>
      </div><figcaption className="text-muted-foreground text-xs">{"other"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/navigation-helpers.test.tsx
- static: npm run type:check
- browser: Verify both themes, platform labels, page boundaries and narrow containers.
