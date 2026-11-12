import type { ComponentDefinition } from "./types";

export const baselineNavigation = [
  {
    id: "breadcrumb",
    title: "Breadcrumb",
    group: "Navigation",
    summary: "Show the current location and links to its ancestors.",
    sourceFiles: [
      "src/components/v4/ui/breadcrumb.tsx",
      "src/components/v4/ui/breadcrumb.module.css",
      "src/components/v4/ui/switcher.tsx"
    ],
    exports: [
      "Breadcrumb",
      "BreadcrumbEllipsis",
      "BreadcrumbItem",
      "BreadcrumbLink",
      "BreadcrumbList",
      "BreadcrumbPage",
      "BreadcrumbSeparator",
      "BandDivider",
      "Switcher"
    ],
    referenceNames: ["Breadcrumb", "Switcher"],
    behavior: [
      "Breadcrumb supports explicit parts or typed items, middle-path collapse and current ancestry. Product crumbs switch context and give way from outer labels inward at narrow widths.",
      "A crumb's name goes to that level's page through one of three props. link takes the app's link target and renders through CipherLink (in the app, a TanStack route built with linkOptions, so to, params, search and hash are checked against the route tree, the way RowLink does it), href a plain URL, and onNavigate an in-page handler that also runs on a link or href click, so it can preventDefault. With none of them the crumb has no page of its own.",
      "A crumb with a switcher whose name has a page is two targets in one segment: the name, then a standalone chevron button that opens the Switcher, anchored to the segment's start. Clicking the name never opens the Switcher; it navigates. The two are separate surfaces: the name takes the shared hover ground on hover and the shared press ground while pressed, the chevron keeps its own hover, press and open grounds, and a space-2 gap between them shows two targets. The gap stays visible but is never dead: the name's hit area runs across it to the chevron, so every pixel of the segment belongs to one target. When the name only opens the same Switcher, the whole segment is one button that wraps the media, the label and the chevron glyph: every pixel of it, padding and gaps included, opens the Switcher, hover draws the shared hover ground across it, and pressing it or an open Switcher draws the press ground. Crumb names that navigate and plain ancestor links take the pointer cursor, like any link; the chevron, the switcher-only segment and the middle-levels button keep the default cursor. Either way the ground's inline padding is cancelled by a negative margin, so the text stays on the content edge. In the product variant every ground (name, chevron, switcher-only segment and plain ancestor link) is size-shell-target (32px) tall with space-control-inline-sm (10px) inline padding, and crumbs use the label type role (14px); the default variant keeps size-nested-sm grounds, space-6 padding and the small role. The current crumb is plain text and never takes a hover ground. TopBar marks its trail with data-org-zone; there the root switcher crumb drops the negative start margin, takes the Sidebar row's inset, glyph size and label gap, is capped at --v4-crumb-root-max, and its width is --v4-crumb-root-size while the Sidebar is open and its content width while it is collapsed, eased between the two with interpolate-size over duration-slow, so the BandDivider after it follows it in the flow.",
      "Fallbacks keep every target alive. A switcher crumb without a page, and a switcher crumb that is the current page, become that one segment button for the Switcher. A crumb with neither a page nor a switcher is plain text, and the current crumb without a switcher is plain text marked as the current page.",
      "A Switcher option with onSelect is an action row inside its group, such as New sub-organization under Sub-organizations: choosing it runs the action and closes the popover without changing the value. A SwitcherAction with link renders as one CipherLink anchor inside its row, like a crumb's link: a click or Enter navigates, middle-click and modifier-click open a new tab, and the popover closes; without link, onSelect runs as before. Options keep their groups in order of first appearance, so the row lands where it is listed. In the TopBar band the root switcher crumb reads in ink at 600, and data-fill on a Breadcrumb lets a single switcher crumb fill its row with the chevron at the end, as in the nav Sheet.",
      "Crumbs are separated by a vertical divider, never a typed slash: a size-crumb-divider-width line, size-crumb-divider tall, in crumb-divider, drawn by BandDivider. BandDivider is an element in the layout flow inside the following crumb's li, aria-hidden, with space-crumb-divider on each side between the line and the neighboring target's ground, in both variants; no crumb offsets it with a negative margin, so both gaps are always equal. Every crumb target pads its text by its inset, so the text sits space-crumb-divider plus the inset from the line (10px in the band, 6px elsewhere), and only the first crumb pulls back by its inset to keep its label on the content edge. BreadcrumbSeparator draws the same element by default, and the TopBar's right cluster uses it between search and the account trigger.",
      "lastIsCurrent={false} keeps every crumb an ancestor, for trails that sit above a page title."
    ],
    accessibility: [
      "Use the breadcrumb landmark name and aria-current for the current location. Switching menus retain accessible labels when visible text collapses.",
      "A switcher crumb with a page has two tab stops in reading order, the name and then the chevron, and both draw the ink focus outline. The chevron carries the popup attributes, and its name joins switcher.label and the crumb's text, such as Switch project payments-api. A switcher crumb without a page, or the current one, is one tab stop: the segment button carries aria-haspopup and aria-expanded, draws the ink focus outline around the whole segment and takes the same name, such as Switch environment Production."
    ],
    limitations: [
      "A crumb's mono is for a machine value such as a secret key or path segment shown as code. Project, organization, environment and folder crumbs, and the options of a crumb's Switcher, are names and stay in the sans (rule/mono-machine-values).",
      "The owner supplies real destinations and switching callbacks; collapse does not implement routing."
    ],
    examples: [
      {
        id: "default",
        title: "Collapsed ancestry and project switching",
        module: "./examples/breadcrumb/default.tsx",
        states: ["controlled", "overflow", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "crumb target",
        expected: ["page and switcher", "switcher only", "plain text"],
        shown: [
          {
            value: "page and switcher",
            exampleId: "default",
            label: "product"
          },
          {
            value: "switcher only",
            exampleId: "default",
            label: "product"
          },
          {
            value: "plain text",
            exampleId: "default",
            label: "product"
          }
        ]
      },
      {
        axis: "variant",
        expected: ["default", "product"],
        shown: [
          {
            value: "default",
            exampleId: "default",
            label: "default"
          },
          {
            value: "product",
            exampleId: "default",
            label: "product"
          }
        ]
      },
      {
        axis: "Switcher.side",
        slot: "popover-content",
        expected: ["bottom", "top", "right"],
        shown: [],
        omitted: [
          {
            value: "bottom",
            reason: "The switcher opens below its crumb by default; placement is a popover option."
          },
          {
            value: "top",
            reason: "Placement is a popover option and adds no breadcrumb behavior."
          },
          {
            value: "right",
            reason: "Placement is a popover option and adds no breadcrumb behavior."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use real ancestor destinations and give each switcher crumb its level's page as link, href or onNavigate; retain the current location when middle items collapse."
      ],
      avoid: [
        "Repeat the page title as a fake clickable ancestor, make a crumb's name open its switcher when the level has a page, or type a separator character between crumbs."
      ],
      decision:
        "Choose Breadcrumb for page ancestry. Use a context switcher for changing project or environment and Tabs for peer views.",
      rules: [
        {
          id: "breadcrumb-destination-labels",
          when: "An ancestor link switches the local resource context.",
          do: "Use the actual resource name and preserve disclosure chevrons only for hierarchy or switching.",
          avoid: "Add a promotional call to action or a decorative arrow after every ancestor.",
          reason: "A path should predict the destination before activation.",
          evidence: ["src/components/v4/ui/breadcrumb.tsx"],
          detect: {
            by: "review",
            how: "Activate every ancestor and confirm the displayed local context matches its label."
          }
        },
        {
          id: "breadcrumb-switcher-segment",
          when: "A crumb switches the organization, project or environment.",
          do: "Pass switcher on the crumb and the level's page as link, href or onNavigate, so the name navigates and the chevron alone opens the Switcher.",
          avoid:
            "Make the name open the Switcher when the level has a page, leave a name that looks clickable and does nothing, or give a name with a page the same hover ground as its chevron.",
          reason:
            "People expect a crumb's name to take them to that level. Keeping switching on the chevron leaves both actions one step away, and separate hover grounds show which part does which.",
          evidence: [
            "src/components/v4/ui/breadcrumb.tsx",
            "src/components/v4/ui/breadcrumb.module.css"
          ],
          detect: {
            by: "review",
            how: "Click each switcher crumb's name: it navigates and no popover opens, unless the level has no page. Tab reaches the name, then the chevron, each with a visible focus ring, and the popover opens from the segment's left edge. Hover a name with a page and only the name takes a ground; hover a switcher-only crumb and the whole segment does. Sample document.elementFromPoint across each segment's box: a switcher-only segment answers its one button everywhere, and a segment with a page answers the name or the chevron with nothing between them."
          }
        },
        {
          id: "breadcrumb-usage",
          when: "A deep resource page needs a route back to its parents.",
          do: "Link each ancestor and mark the final item as the current page; expose collapsed ancestors through the overflow control.",
          avoid: "Make every crumb a dropdown or repeat the entire path in the page title.",
          reason: "Ancestry should remain a short, predictable route through the hierarchy.",
          evidence: [
            "src/components/v4/ui/breadcrumb.tsx",
            "src/pages/design-system/examples/breadcrumb/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Follow every ancestor and open collapsed items with the keyboard; each reaches the represented ancestor and the current item is not a false action."
          }
        }
      ],
      states: [
        {
          state: "overflow",
          guidance: "Collapse intermediate ancestors while retaining access to them."
        },
        {
          state: "current",
          guidance: "Render the current item without a misleading navigation action."
        }
      ],
      antiSlop: [
        {
          do: "Use resource names and hierarchy labels.",
          avoid: "Add slash-separated metadata such as region, role and expiry to the path.",
          reason: "Those values describe the object but are not its ancestors."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "browser",
        command:
          "npm run dev; open /design-system#breadcrumb and verify the documented interaction."
      }
    ]
  },
  {
    id: "tabs",
    title: "Tabs",
    group: "Navigation",
    summary: "Switch between peer views in the same context.",
    sourceFiles: ["src/components/v4/ui/tabs.tsx", "src/components/v4/ui/navigation.module.css"],
    exports: [
      "Tabs",
      "TabsContent",
      "TabsList",
      "tabsListVariants",
      "TabsTrigger",
      "TabsProps",
      "TabDefinition"
    ],
    referenceNames: ["Tabs"],
    behavior: [
      "Use tabs/value/onChange for a typed collection, or compose the retained Radix parts. Tabs and TabsList take the same variant, underline or segmented. underline draws a 2px ink line under the selected tab on a 1px track rule; segmented sits on a tint track and marks the selected tab with the shared selected paint; a horizontal segmented track is control-default tall (a 2px inset around the tabs), so it lines up with Inputs and Buttons in a toolbar row. Both share one measured indicator. A count renders as a neutral Count chip. The panel sits 16px under the track; when no tab has content, Tabs renders only the tab bar, with no empty panels or gap, for a filter or a page section switcher. Overflow scrolls in the selected orientation and reveals the selected tab.",
      "width on Tabs sizes the track and its triggers together, and a composed TabsList reads it from Tabs. The default, content, fits the track to its triggers; full stretches the track to its container and gives every horizontal trigger an equal share, never narrower than its label. There is no full-width track with content-width triggers (rule/tab-width). The underline variant's 1px rule is a divider rather than a track, so it spans its container while content-width triggers sit on it; UNDERLINE_RULE_SPANS in ui/tabs.tsx turns that off."
    ],
    accessibility: [
      "Name the tab list. Arrow keys, Home and End move between tabs and skip disabled ones. A horizontal scroll over the tabs hands back to the page at either end, and reduced motion stops the indicator sliding."
    ],
    limitations: [
      "Each tab definition owns a panel, even when content is omitted. Supply meaningful content for usable views; use ToggleGroup for a standalone filter."
    ],
    examples: [
      {
        id: "default",
        title: "Variants",
        module: "./examples/tabs/default.tsx",
        states: ["default", "disabled"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["underline", "segmented"],
        shown: [
          { value: "underline", exampleId: "default", label: "underline" },
          { value: "segmented", exampleId: "default", label: "segmented" }
        ]
      },
      {
        axis: "width",
        expected: ["content", "full"],
        shown: [
          { value: "content", exampleId: "default", label: "segmented" },
          { value: "full", exampleId: "default", label: "segmented, full width" }
        ]
      },
      {
        axis: "Orientation",
        expected: ["horizontal", "vertical"],
        shown: [{ value: "horizontal", exampleId: "default", label: "underline" }],
        omitted: [
          {
            value: "vertical",
            reason:
              "A side list: the tabs stack and the underline indicator moves to the right edge. Same parts, same keyboard model on the other axis."
          }
        ]
      },
      {
        axis: "Activation",
        expected: ["automatic", "manual"],
        shown: [{ value: "automatic", exampleId: "default", label: "underline" }],
        omitted: [
          {
            value: "manual",
            reason:
              'activationMode="manual" keeps the panel until Enter or Space. It changes no paint, so a still example cannot show it.'
          }
        ]
      },
      {
        axis: "TabsList.variant",
        expected: ["underline", "segmented"],
        shown: [],
        omitted: [
          {
            value: "underline",
            reason:
              "The composed TabsList takes the same two values as Tabs and renders the same track."
          },
          {
            value: "segmented",
            reason:
              "The composed TabsList takes the same two values as Tabs and renders the same track."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use underline or segmented Tabs for peer panels. Choose activation policy from whether panel changes can follow focus immediately."
      ],
      avoid: [],
      decision:
        "Choose Tabs for peer views of the same context. Use navigation links for unrelated destinations.",
      rules: [
        {
          id: "tabs-usage",
          when: "Switching views should retain the enclosing resource context.",
          do: "Use stable tab values and meaningful panel labels; keep view selection separate from saving form data.",
          avoid:
            "Use tabs to hide required sequential steps or make unrelated pages look like panels.",
          reason:
            "Peer panels imply that the person can move among them without completing a workflow.",
          evidence: [
            "src/components/v4/ui/tabs.tsx",
            "src/pages/design-system/examples/tabs/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Switch peer panels with keyboard. Selected tab, panel content and accessible relationships agree, and no hidden required sequential step is disguised as a peer view."
          }
        },
        {
          id: "tabs-peer-view-model",
          when: "A task offers independent peer panels.",
          do: "Give every tab a meaningful panel and stable value, choose automatic activation for ready content or manual activation when changing panels should be deliberate.",
          avoid:
            "Use Tabs as an unlabeled filter with empty panels or as sequential steps with hidden prerequisites.",
          reason:
            "Peer views, filters and prerequisite workflows have different semantics and navigation expectations.",
          detect: {
            by: "review",
            how: "Move focus through tabs in both activation modes. Focus and active panel follow the declared policy, disabled tabs are skipped and long labels remain reachable."
          },
          evidence: [
            "src/components/v4/ui/tabs.tsx",
            "src/pages/design-system/examples/tabs/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "controlled",
          guidance: "Keep selected value aligned with the actual visible panel."
        },
        {
          state: "disabled",
          guidance:
            "Explain why a view cannot be opened instead of hiding the prerequisite in an inaccessible panel."
        }
      ],
      antiSlop: [
        {
          do: "Use short names that distinguish each view's content.",
          avoid: "Give every tab an icon, count and status badge when only its name matters.",
          reason: "Extra adornment competes with the active panel indicator."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "browser",
        command: "npm run dev; open /design-system#tabs and verify the documented interaction."
      }
    ]
  },
  {
    id: "context-menu",
    title: "Context Menu",
    group: "Actions",
    summary: "Expose secondary actions from a context menu.",
    sourceFiles: ["src/components/v4/ui/context-menu.tsx"],
    exports: [
      "ContextMenu",
      "ContextMenuCheckboxItem",
      "ContextMenuContent",
      "ContextMenuGroup",
      "ContextMenuItem",
      "ContextMenuLabel",
      "ContextMenuPortal",
      "ContextMenuRadioGroup",
      "ContextMenuRadioItem",
      "ContextMenuSeparator",
      "ContextMenuShortcut",
      "ContextMenuSub",
      "ContextMenuSubContent",
      "ContextMenuSubTrigger",
      "ContextMenuTrigger"
    ],
    referenceNames: ["ContextMenu"],
    behavior: [
      "Highlighted, open and active rows use a translucent ink overlay at the shared hover token, so the menu surface behind shows through; they never take an opaque fill.",
      "Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.",
      "ContextMenu opens from its trigger's context action. Action items call onSelect and close; checkbox/radio items stay open unless closeOnSelect is true.",
      "The DropdownMenu item parts (item, checkbox and radio items, label, separator, group and sub-menu) render in a ContextMenu too: ContextMenuContent sets the menu kind, and each part picks the matching Radix primitive, so one menu node renders identically, descriptions, disabled reasons and destructive styling included, as a More menu or a right-click menu. RowContextMenu uses this to open a row's actions on right-click.",
      "ContextMenuSubContent portals into the V4Scope container like the root menu, never inside its parent panel, so the parent's overflow and entry motion cannot clip or hide it. It opens beside its SubTrigger row: sideOffset 4 (space-4) and alignOffset -3 (the menu inset) line its first row up with the trigger, and when the trailing side has no room within the collision padding (8, space-8) it flips to the leading side, still beside the parent and never over it."
    ],
    accessibility: [
      "The menu takes focus, arrow keys move between items and each item is announced as a menu item. Keep essential actions available through a visible control as well."
    ],
    limitations: [
      "Provide another visible way to perform essential actions.",
      "ContextMenu supports open/onOpenChange after interaction establishes the pointer anchor. There is no defaultOpen prop. Root content is positioned at the pointer."
    ],
    examples: [
      {
        id: "default",
        title: "Right-click region",
        module: "./examples/context-menu/default.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "ContextMenuItem.variant",
        expected: ["default", "destructive"],
        shown: [],
        omitted: [
          {
            value: "default",
            reason:
              "Both variants sit in the one menu: Connection details is the default row and Archive environment is destructive."
          },
          {
            value: "destructive",
            reason:
              "Both variants sit in the one menu: Connection details is the default row and Archive environment is destructive."
          }
        ]
      },
      {
        axis: "Inset",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Show archived"
          }
        ],
        omitted: [
          {
            value: "true",
            reason:
              "Inset reserves the icon column for a plain row beside rows that carry icons. The example menu has no icons."
          }
        ]
      },
      {
        axis: "Close on select",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Show archived"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Show metadata and close"
          }
        ]
      },
      {
        axis: "Checked",
        expected: ["false", "true", "indeterminate"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Show archived"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Show metadata and close"
          }
        ],
        omitted: [
          {
            value: "indeterminate",
            reason:
              "A mixed state belongs to a tri-state parent choice the host owns; the example has none."
          }
        ]
      },
      {
        axis: "Root placement",
        expected: ["pointer"],
        shown: [{ value: "pointer", exampleId: "default", label: "Right-click this area" }]
      }
    ],
    guidance: {
      use: [
        "Provide a visible action path for essential operations and keep destructive consequences explicit in item labels and variant."
      ],
      avoid: [
        "Make right-click the only path to edit or remove a resource, or pretend root content is anchored by a side prop."
      ],
      decision:
        "Choose ContextMenu for shortcuts on an already discoverable object. Use DropdownMenu when the action entry point must be visible.",
      rules: [
        {
          id: "context-menu-usage",
          when: "An essential action appears in a right-click menu.",
          do: "Provide the same action through a visible button or menu, and make the context trigger keyboard reachable.",
          avoid: "Make right-click the only way to inspect, copy or restore an object.",
          reason: "Touch users and people who do not discover context menus still need the action.",
          evidence: [
            "src/components/v4/ui/context-menu.tsx",
            "src/pages/design-system/examples/context-menu/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Complete the essential object action without right-clicking; the visible alternative and Shift+F10 context route both reach the intended action."
          }
        }
      ],
      states: [
        {
          state: "disabled",
          guidance: "Explain why a locked action is unavailable in surrounding object detail."
        },
        {
          state: "copy",
          guidance:
            "Announce copied only after the clipboard write fulfills; show a failure if it rejects."
        }
      ],
      antiSlop: [
        {
          do: "Name menu actions for the object under the pointer.",
          avoid: "Fill the menu with disabled coming-soon entries.",
          reason: "Unavailable placeholders hide the actions a person can use now."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "browser",
        command:
          "npm run dev; open /design-system#context-menu and verify the documented interaction."
      }
    ]
  },
  {
    id: "dropdown-menu",
    title: "Dropdown Menu",
    group: "Actions",
    summary: "Choose an action or setting from a trigger menu.",
    sourceFiles: [
      "src/components/v4/ui/dropdown-menu.tsx",
      "src/components/v4/ui/menu-content.tsx"
    ],
    exports: [
      "DropdownMenu",
      "DropdownMenuCheckboxItem",
      "DropdownMenuContent",
      "DropdownMenuGroup",
      "DropdownMenuItem",
      "DropdownMenuLabel",
      "DropdownMenuPortal",
      "DropdownMenuRadioGroup",
      "DropdownMenuRadioItem",
      "DropdownMenuSeparator",
      "DropdownMenuShortcut",
      "DropdownMenuSub",
      "DropdownMenuSubContent",
      "DropdownMenuSubTrigger",
      "DropdownMenuTrigger"
    ],
    referenceNames: ["DropdownMenu"],
    behavior: [
      "Highlighted, open and active rows use a translucent ink overlay at the shared hover token, so the menu surface behind shows through; they never take an opaque fill.",
      "Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.",
      "Radix Root owns open/onOpenChange. Action items close after onSelect; checkbox/radio changes stay open by default and can opt into closeOnSelect.",
      "DropdownMenuItem, DropdownMenuCheckboxItem and DropdownMenuRadioItem take an optional description, a muted second line under the label. A disabled item uses it for the reason it is unavailable, so the action or setting stays visible and explains itself.",
      "DropdownMenuItem takes disabledReason for an action blocked by a permission or state: the item stays in the keyboard order, dims like a disabled row, shows the reason in place of its description (under an element label and inside an asChild child too), exposes it as the accessible description, and choosing it with Enter or Space does nothing and keeps the menu open, so onSelect never runs. Prefer it to disabled with a description whenever the person should be able to reach the reason by keyboard.",
      "DropdownMenuSubContent portals into the V4Scope container like the root menu, never inside its parent panel, so the parent's overflow and entry motion cannot clip or hide it. It opens beside its SubTrigger row: sideOffset 4 (space-4) and alignOffset -3 (the menu inset) line its first row up with the trigger, and when the trailing side has no room within the collision padding (8, space-8) it flips to the leading side, still beside the parent and never over it."
    ],
    accessibility: [
      "A named trigger opens the menu. Typing a letter jumps to a matching item, arrow keys skip disabled items (but stop on an item with disabledReason, which is announced as unavailable with its reason) and focus returns to the trigger on close. Use checkbox or radio items for persistent selection.",
      "DropdownMenuTrigger defers to Button. Without asChild it renders an outline Button; with asChild it adds nothing, so rest, hover, open, focus and disabled all come from the Button. No tint is ever drawn inside a bordered control.",
      "The panel follows the shared menu recipe: pop ground, pop-line edge and shadow-pop, a 3px inset on all four sides, and 32px rows that are inset square blocks. Separators run edge to edge; rows and their tints never do.",
      "Two translucent thumbs mark rows: a hover thumb that follows the pointer and keyboard and stays on the last row while the pointer is anywhere in the panel, and a selection thumb on the checked or current item that shows only while the hover thumb is hidden. Both appear in place on open and glide between rows after that; the current item keeps its weight and check while the hover thumb is elsewhere. A row whose submenu, flyout or popover is open (aria-haspopup with aria-expanded true) keeps the hover thumb while the pointer is in that popover and the selection thumb stays hidden; on close the hover thumb goes back to the pointer, or hands off to the selection thumb if the pointer has left."
    ],
    limitations: [
      "Menu checked state and action effects are caller-owned; menu dismissal does not mean an operation succeeded."
    ],
    examples: [
      {
        id: "default",
        title: "Environment actions",
        module: "./examples/dropdown-menu/default.tsx",
        states: ["default", "disabled"]
      },
      {
        id: "states",
        title: "Checked states",
        module: "./examples/dropdown-menu/states.tsx",
        states: ["default", "disabled"]
      },
      {
        id: "placements",
        title: "Placements",
        module: "./examples/dropdown-menu/placements.tsx",
        states: ["default"]
      },
      {
        id: "disabled-reason",
        title: "Disabled with a reason",
        module: "./examples/dropdown-menu/disabled-reason.tsx",
        states: ["disabled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "Side",
        expected: ["top", "right", "bottom", "left"],
        shown: [
          {
            value: "top",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "right",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "bottom",
            exampleId: "placements",
            label: "bottom / end"
          },
          {
            value: "left",
            exampleId: "placements",
            label: "left / center"
          }
        ]
      },
      {
        axis: "Alignment",
        expected: ["start", "center", "end"],
        shown: [
          {
            value: "start",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "center",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "end",
            exampleId: "placements",
            label: "bottom / end"
          }
        ]
      },
      {
        axis: "DropdownMenuItem.variant",
        expected: ["default", "destructive"],
        shown: [
          {
            value: "default",
            exampleId: "default",
            label: "default"
          },
          {
            value: "destructive",
            exampleId: "default",
            label: "destructive"
          }
        ]
      },
      {
        axis: "Inset",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Show archived"
          }
        ],
        omitted: [
          {
            value: "true",
            reason:
              "Inset reserves the icon column for a plain row beside rows that carry icons. The example menu has no icons."
          }
        ]
      },
      {
        axis: "Close on select",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Show archived"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Show metadata and close"
          }
        ]
      },
      {
        axis: "Checked",
        expected: ["false", "true", "indeterminate"],
        shown: [
          {
            value: "false",
            exampleId: "states",
            label: "false selection"
          },
          {
            value: "true",
            exampleId: "states",
            label: "true selection"
          },
          {
            value: "indeterminate",
            exampleId: "states",
            label: "Mixed selection"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use Item, CheckboxItem and RadioItem for their actual action or value contract, and prevent default dismissal only when continued interaction is needed."
      ],
      avoid: [
        "Style ordinary items to look checked, add buttons inside menu items or announce success merely because the menu closed."
      ],
      decision:
        "Choose DropdownMenu for a short set of actions or checked preferences behind a visible trigger. Use Popover for editable controls and Select for a form value.",
      rules: [
        {
          id: "dropdown-menu-usage",
          when: "A menu includes a dangerous operation among ordinary actions.",
          do: "Separate the destructive item, name its consequence, and let the host confirm when necessary.",
          avoid:
            "Put a multi-field form or an unguarded irreversible action in a generic More menu.",
          reason:
            "Menu selection closes quickly and is unsuitable for a draft that needs validation.",
          evidence: [
            "src/components/v4/ui/dropdown-menu.tsx",
            "src/pages/design-system/examples/dropdown-menu/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Use the menu with keyboard only. Action items do what their labels name, checked items reflect owner state and editable tasks use a suitable form surface."
          }
        },
        {
          id: "dropdown-menu-nested-layers",
          when: "An overlay opens from inside another one: a submenu, a popover, select or dialog launched from a menu, or a tooltip inside a popover.",
          do: "Let every overlay portal into the V4Scope container at the one overlay layer (z-50). The child opens after its parent, so it mounts later in that container and paints above it.",
          avoid:
            "Render overlay content inline inside another overlay, or give one overlay a higher z-index or an isolating className to win a stacking fight.",
          reason:
            "Inline content is clipped by its parent's overflow and placed in its parent's transformed frame, so a submenu that flips can land behind the panel it came from.",
          evidence: ["src/components/v4/ui/dropdown-menu.tsx"],
          detect: {
            by: "test",
            test: "src/components/v4/ui/overlay-regressions.test.tsx",
            how: "Opens a submenu from an open DropdownMenu and checks the submenu sits outside the parent panel, in the same scope container, after it in DOM order."
          }
        }
      ],
      states: [
        {
          state: "checked",
          guidance: "Control checkbox and radio items from actual preference state."
        },
        {
          state: "pending",
          guidance: "Keep continuing operation feedback outside the menu after it closes."
        }
      ],
      antiSlop: [
        {
          do: "Keep the trigger label tied to the object or action set.",
          avoid: "Use several adjacent unlabeled ellipsis buttons for different action sets.",
          reason: "Identical hidden menus make the correct action hard to locate."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "browser",
        command:
          "npm run dev; open /design-system#dropdown-menu and verify the documented interaction."
      }
    ]
  },
  {
    id: "command-menu",
    title: "Command",
    group: "Utilities",
    summary: "Find and execute an action using a searchable command list.",
    sourceFiles: [
      "src/components/v4/ui/command.tsx",
      "src/components/v4/ui/command-menu.tsx",
      "src/components/v4/ui/picker.module.css"
    ],
    exports: [
      "Command",
      "CommandDialog",
      "CommandEmpty",
      "CommandGroup",
      "CommandInput",
      "CommandItem",
      "CommandList",
      "CommandSeparator",
      "CommandShortcut",
      "CommandMenuItem",
      "CommandMenuGroup",
      "CommandMenuProps",
      "CommandMenu"
    ],
    referenceNames: ["CommandMenu"],
    behavior: [
      "Groups rank label matches while keeping group order; pages drill into a nested command set. onQueryChange receives query and page ID; filter=false delegates filtering to the host.",
      "Pending async commands reject duplicate activation, including the link shortcut; actual dialog close clears page, query and feedback before the next session.",
      "CommandList scrolls in a ScrollArea viewport with the edge fade and the styled ScrollBar, so no native scrollbar or arrow buttons show. CommandDialog keeps its title and description visually hidden outside DialogHeader, so the palette skips the Dialog section layout and its search row, list and footer run edge to edge."
    ],
    accessibility: [
      "Arrow keys move through commands and skip disabled ones. Escape leaves a nested page before it closes the menu. Mod+Enter opens an enabled link that is not pending in a new tab."
    ],
    limitations: [
      "An item's mono is for a machine value such as a secret key; project, environment and other named entities stay in the sans (rule/mono-machine-values).",
      "Async action IDs stay disabled and busy until settlement. Actual dialog close resets query/page and notifies onQueryChange('', undefined); inline panels retain their query. Remote search, shortcut bindings shown on items and persistence remain host-owned."
    ],
    examples: [
      {
        id: "default",
        title: "Command menu",
        module: "./examples/command-menu/default.tsx",
        states: ["default", "controlled", "disabled", "keyboard"]
      },
      {
        id: "states",
        title: "Loading and no results",
        module: "./examples/command-menu/states.tsx",
        states: ["loading", "empty", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "Presentation",
        expected: ["inline", "dialog"],
        shown: [
          {
            value: "dialog",
            exampleId: "default",
            label: "Search commands"
          }
        ],
        omitted: [
          {
            value: "inline",
            reason:
              "Inline embeds the palette in a page region. The examples show only the triggered dialog, and the inline mode shares its panel and rows."
          }
        ]
      },
      {
        axis: "Hotkey",
        expected: ["mod+k", "false"],
        shown: [
          {
            value: "mod+k",
            exampleId: "default",
            label: "Search commands"
          },
          {
            value: "false",
            exampleId: "states",
            label: "Loading results"
          }
        ]
      },
      {
        axis: "Filter",
        expected: ["true", "false"],
        shown: [
          {
            value: "true",
            exampleId: "default",
            label: "Search commands"
          },
          {
            value: "false",
            exampleId: "states",
            label: "No results"
          }
        ]
      },
      {
        axis: "Loading",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Search commands"
          },
          {
            value: "true",
            exampleId: "states",
            label: "Loading results"
          }
        ]
      },
      {
        axis: "Item danger",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Search commands"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Search commands"
          }
        ]
      },
      {
        axis: "Item keepOpen",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Search commands"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Search commands"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Give commands stable unique ids, keep page groups meaningful and use filter=false only when the host actually supplies filtered results."
      ],
      avoid: [
        "Use CommandMenu as a form value picker, show a shortcut that has no binding or treat closing as proof an action succeeded."
      ],
      decision:
        "Choose CommandMenu for searching destinations, objects and actions from one keyboard entry point. Use Combobox for selecting a field value.",
      rules: [
        {
          id: "command-menu-truthful-pending",
          when: "A command returns a promise that can reject.",
          do: "Keep the action named while pending, retain the command on failure and close only after it fulfills.",
          avoid:
            "Replace failure with a success notification or clear the query before the person can retry.",
          reason: "The visible command must report what the local operation actually did.",
          evidence: ["src/components/v4/ui/command-menu.tsx"],
          detect: {
            by: "review",
            how: "Reject synchronization, retry the same command and confirm local completion follows fulfillment."
          }
        },
        {
          id: "command-menu-usage",
          when: "The menu displays a keyboard shortcut for an action.",
          do: "Register that shortcut in the host and route selection to the same named action as the visible item.",
          avoid: "Display a shortcut cap that does nothing or treat typing as a committed action.",
          reason:
            "The menu should make real actions discoverable, not advertise nonexistent bindings.",
          evidence: [
            "src/components/v4/ui/command.tsx",
            "src/pages/design-system/examples/command-menu/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Search by a visible action label and invoke the displayed shortcut. Both activate the same real action; a typed query alone does not execute it."
          }
        }
      ],
      states: [
        {
          state: "empty",
          guidance: "Explain that no commands match the query and retain the query."
        },
        {
          state: "pending",
          guidance:
            "Keep asynchronous action feedback outside the closed menu when the action continues."
        }
      ],
      antiSlop: [
        {
          do: "Group results by a meaningful type such as Pages and Resources.",
          avoid: "Mix unlabeled destructive actions into a list of similarly named destinations.",
          reason: "Search results must make the difference between navigation and mutation clear."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "browser",
        command:
          "npm run dev; open /design-system#command-menu and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
