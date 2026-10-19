# Avatar

Identify people and show grouped participants.

## Choose this component

Choose Avatar for people, machine identities or agents with an explicit kind, and Identity when name and metadata belong together. Identify an organization with its name and a neutral building icon.

## Usage rules

### avatar-usage

Owner: avatar.

When participants in the same member group have missing photos or different identity kinds.

Do: Keep names or meaningful fallbacks and make person, machine or agent kind explicit. Keep size and status differences tied to supplied meaning.

Avoid: Invent a profile photo or imply ownership, presence or rank through arbitrary size and colored dots.

Why: Identity styling must preserve recognition without creating a false relationship or status.

Checked by: review only. Look for: Remove all photos from a participant group. Names or meaningful fallbacks still identify members, and group size/status differences correspond to supplied data.

Source evidence:
- src/components/v4/ui/avatar.tsx
- src/pages/design-system/examples/avatar/default.tsx

## State guidance

- image-error: Keep readable fallback initials and the visible name.
- group: Show the remaining participant count when the visible group is bounded.

## Presentation rules

Do: Use consistent avatar sizes within one participant group.

Avoid: Make one participant larger or add status dots without a real distinction.

Why: Unequal geometry implies a rank or presence state the data may not contain.

## Import and exports

- src/components/v4/ui/avatar.tsx
- src/components/v4/ui/helpers.module.css

Exports: Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage, Identity. Source TypeScript defines the API.

## Behavior

- Avatar supports person, machine, agent and fallback identities, numeric size and optional status. Every kind shares one paint, a tint square with ink initials or icon and 4px corners; the initials or icon tell the kinds apart. Initials are 10, 12 and 14px at 24, 32 and 40px. The status dot is an 8px square outside the bottom corner with a 2px surface ring. AvatarGroup overlaps by 4px and exposes overflow, and Identity pairs a lead with text.

## Accessibility

- Provide an identity name or accessible label. Organizations use text or a neutral icon, never an invented avatar.

## Use cases

- Choose the real person, machine, agent or fallback kind, keep a visible name beside Identity and make status meaning available in text.

## Avoid

- Give an organization a person avatar, invent initials for anonymous identities or use a colored status dot as the only explanation.

## Limits

- Organization avatars are unsupported. Status is visual unless the owner supplies its meaning in the accessible label or nearby text.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### kind

- person: example `variants`, visible label "person".
- machine: example `variants`, visible label "machine".
- agent: example `variants`, visible label "agent".
- fallback: example `variants`, visible label "fallback".

### size

- sm: example `sizes`, visible label "sm".
- default: example `sizes`, visible label "default".
- lg: example `sizes`, visible label "lg".

### status

- ok: example `states`, visible label "ok".
- warn: example `states`, visible label "warn".
- off: example `states`, visible label "off".
- absent: example `variants`, visible label "person".

### content state


- loaded image: omitted. AvatarImage fills the same square, clipped to its corners. The fixtures hold no real photo, and a drawn stand-in would look like a defect.
- failed image: omitted. A failed AvatarImage falls back to the initials, which every example already shows.
- decorative fallback: omitted. aria-hidden on an Avatar next to a visible name. It paints the same as person.

## Executable examples

### Group

Save this example at `src/pages/design-system/examples/avatar/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/avatar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Avatar, AvatarGroup } from "../../../../components/v4/ui/avatar";
const members = ["Ada Morgan", "Sam Lee", "Mina Patel", "Rory Chen", "Eli Ford"];
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <AvatarGroup max={3} label="Project members">
          {members.map((name) => (<Avatar key={name} name={name}/>))}
        </AvatarGroup>
      </div><figcaption className="text-muted-foreground text-xs">{"Group of five, max 3"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <AvatarGroup size={24} label="Reviewers">
          {members.slice(0, 3).map((name) => (<Avatar key={name} name={name}/>))}
        </AvatarGroup>
      </div><figcaption className="text-muted-foreground text-xs">{"Small group"}</figcaption></figure>
    </div>);
}
```

### Kinds

Save this example at `src/pages/design-system/examples/avatar/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/avatar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Avatar } from "../../../../components/v4/ui/avatar";
const identities = [
    { kind: "person", name: "Ada Morgan" },
    { kind: "machine", name: "Deployment service" },
    { kind: "agent", name: "Rotation agent" },
    { kind: "fallback", name: "Unknown member" }
] as const;
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {identities.map(({ kind, name }) => (<figure key={kind} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Avatar kind={kind} name={name}/>
        </div><figcaption className="text-muted-foreground text-xs">{kind}</figcaption></figure>))}
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/avatar/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/avatar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Avatar } from "../../../../components/v4/ui/avatar";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["sm", "default", "lg"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Avatar size={size} name="Ada Morgan"/>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Status

Save this example at `src/pages/design-system/examples/avatar/states.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/avatar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Avatar } from "../../../../components/v4/ui/avatar";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["ok", "warn", "off"] as const).map((status) => (<figure key={status} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Avatar name={`Ada Morgan, ${status}`} status={status} initials="AM"/>
        </div><figcaption className="text-muted-foreground text-xs">{status}</figcaption></figure>))}
    </div>);
}
```

### Identity

Save this example at `src/pages/design-system/examples/avatar/identity.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/avatar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Identity } from "../../../../components/v4/ui/avatar";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Identity name="Alex Kim" description="Workspace administrator"/>
      <Identity name="deploy-production" kind="machine" mono description="Machine identity"/>
      <Identity name="rotation-agent" kind="agent" mono description="Read access to staging"/>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#avatar and verify the documented interaction.
