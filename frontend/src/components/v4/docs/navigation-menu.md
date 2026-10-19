# Navigation Menu

Navigate between related destinations and expandable groups.

## Choose this component

Choose NavigationMenu for top-level destinations with optional descriptive panels. Use Menubar for commands.

## Usage rules

### navigation-menu-usage

Owner: navigation-menu.

When a destination has supporting links in a disclosure panel.

Do: Use real links for destinations and reserve the trigger for opening the panel.

Avoid: Use menu actions as destination links or make a heading-only trigger pretend to navigate.

Why: Opening a panel and visiting a page are different actions.

Checked by: review only. Look for: Open a panel and follow its destination links with keyboard. Opening does not falsely navigate, and the current marker follows the real destination.

Source evidence:
- src/components/v4/ui/navigation-menu.tsx
- src/pages/design-system/examples/navigation-menu/default.tsx

## State guidance

- current: Identify the actual current destination rather than the last hovered panel.
- narrow: Keep destination links reachable when the panel layout wraps.

## Presentation rules

Do: Group destinations by a clear information hierarchy.

Avoid: Put every product feature in an oversized promotional navigation panel.

Why: A navigation panel should shorten route finding rather than become a second landing page.

## Import and exports

- src/components/v4/ui/navigation-menu.tsx

Exports: NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport. Source TypeScript defines the API.

## Behavior

- Radix NavigationMenu coordinates trigger/content pairs and an optional shared viewport; NavigationMenuLink retains native navigation through its child anchor.

## Accessibility

- Keep page destinations as links and disclosure triggers as buttons. Arrow keys move between items and each trigger announces whether its panel is open. Label the navigation landmark.

## Use cases

- Supply real hrefs and active-route state, group by destination hierarchy and keep the current location understandable without color.

## Avoid

- Use a navigation item for a destructive command or set every clicked item active without observing the router.

## Limits

- Destinations and active-route state are owner-supplied; the menu does not perform routing or authorization.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Viewport

- true: example `default`, visible label "Resources".
- false: example `variants`, visible label "vertical / inline panel".

### Orientation

- horizontal: example `variants`, visible label "horizontal / inline panel".
- vertical: example `variants`, visible label "vertical / inline panel".

## Executable examples

### Shared viewport destinations

Save this example at `src/pages/design-system/examples/navigation-menu/default.tsx`; its relative imports are generated for that exact path. States: controlled.

Registry items used: @infisical/navigation-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/navigation-menu";
export default function Example() {
    const [destination, setDestination] = useState("Overview");
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.NavigationMenu>
        <UI.NavigationMenuList>
          <UI.NavigationMenuItem>
            <UI.NavigationMenuLink href="#example-overview" active={destination === "Overview"} onClick={(event) => {
            event.preventDefault();
            setDestination("Overview");
        }}>
              Overview
            </UI.NavigationMenuLink>
          </UI.NavigationMenuItem>
          <UI.NavigationMenuItem>
            <UI.NavigationMenuTrigger>Resources</UI.NavigationMenuTrigger>
            <UI.NavigationMenuContent>
              {["Secrets", "Connections"].map((label) => (<UI.NavigationMenuLink key={label} href={`#example-${label.toLowerCase()}`} active={destination === label} onClick={(event) => {
                event.preventDefault();
                setDestination(label);
            }}>
                  {label}
                </UI.NavigationMenuLink>))}
            </UI.NavigationMenuContent>
          </UI.NavigationMenuItem>
          <UI.NavigationMenuItem value="activity">
            <UI.NavigationMenuTrigger>Activity</UI.NavigationMenuTrigger>
            <UI.NavigationMenuContent>
              {["Credential rotation history", "Client access decisions"].map((label) => (<UI.NavigationMenuLink key={label} href="#navigation-menu" active={destination === label} onClick={(event) => {
                event.preventDefault();
                setDestination(label);
            }}>
                  {label}
                </UI.NavigationMenuLink>))}
            </UI.NavigationMenuContent>
          </UI.NavigationMenuItem>
        </UI.NavigationMenuList>
      </UI.NavigationMenu>
      <p role="status" className="sr-only">
        Current local view: {destination}.
      </p>
    </div>);
}
```

### Orientation and inline panels

Save this example at `src/pages/design-system/examples/navigation-menu/variants.tsx`; its relative imports are generated for that exact path. States: controlled, disabled, keyboard.

Registry items used: @infisical/navigation-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/navigation-menu";
export default function Example() {
    const [value, setValue] = useState("");
    const [destination, setDestination] = useState("Overview");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["horizontal", "vertical"] as const).map((orientation) => (<figure key={orientation} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <UI.NavigationMenu viewport={false} className="max-w-full" orientation={orientation} value={value} onValueChange={setValue} aria-label={`${orientation} connection navigation`}>
            <UI.NavigationMenuList className={orientation === "vertical" ? "flex-col items-start" : "flex-wrap"}>
              <UI.NavigationMenuItem value={`${orientation}-resources`}>
                <UI.NavigationMenuTrigger>Resources</UI.NavigationMenuTrigger>
                <UI.NavigationMenuContent>
                  {["Secrets", "Connections"].map((label) => (<UI.NavigationMenuLink key={label} href="#navigation-menu" active={destination === label} onClick={(event) => {
                    event.preventDefault();
                    setDestination(label);
                    setValue("");
                }}>
                      {label}
                    </UI.NavigationMenuLink>))}
                </UI.NavigationMenuContent>
              </UI.NavigationMenuItem>
              <UI.NavigationMenuItem>
                <UI.NavigationMenuTrigger disabled>Archived</UI.NavigationMenuTrigger>
              </UI.NavigationMenuItem>
            </UI.NavigationMenuList>
          </UI.NavigationMenu>
        </div><figcaption className="text-muted-foreground text-xs">{<>{orientation} / inline panel</>}</figcaption></figure>))}
      <p role="status" className="sr-only">
        Local view: {destination}
      </p>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#navigation-menu and verify the documented interaction.
