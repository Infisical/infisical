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
      "Switcher"
    ],
    referenceNames: ["Breadcrumb", "Switcher"],
    behavior: [
      "Breadcrumb supports explicit parts or typed items, middle-path collapse and current ancestry. Product crumbs switch context and give way from outer labels inward at narrow widths."
    ],
    accessibility: [
      "Use the breadcrumb landmark name and aria-current for the current location. Switching menus retain accessible labels when visible text collapses."
    ],
    limitations: [
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
        "Use real ancestor destinations and typed menu crumbs for actual context changes; retain the current location when middle items collapse."
      ],
      avoid: [
        "Repeat the page title as a fake clickable ancestor or use a decorative separator character to combine unrelated metadata."
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
          "npm run ui:dev; open /design-system#breadcrumb and verify the documented interaction."
      }
    ]
  },
  {
    id: "navigation-menu",
    title: "Navigation Menu",
    group: "Navigation",
    summary: "Navigate between related destinations and expandable groups.",
    sourceFiles: ["src/components/v4/ui/navigation-menu.tsx"],
    exports: [
      "NavigationMenu",
      "NavigationMenuContent",
      "NavigationMenuIndicator",
      "NavigationMenuItem",
      "NavigationMenuLink",
      "NavigationMenuList",
      "NavigationMenuTrigger",
      "navigationMenuTriggerStyle",
      "NavigationMenuViewport"
    ],
    referenceNames: ["NavigationMenu"],
    behavior: [
      "Radix NavigationMenu coordinates trigger/content pairs and an optional shared viewport; NavigationMenuLink retains native navigation through its child anchor."
    ],
    accessibility: [
      "Keep page destinations as links and disclosure triggers as buttons. Arrow keys move between items and each trigger announces whether its panel is open. Label the navigation landmark."
    ],
    limitations: [
      "Destinations and active-route state are owner-supplied; the menu does not perform routing or authorization."
    ],
    examples: [
      {
        id: "default",
        title: "Shared viewport destinations",
        module: "./examples/navigation-menu/default.tsx",
        states: ["controlled"]
      },
      {
        id: "variants",
        title: "Orientation and inline panels",
        module: "./examples/navigation-menu/variants.tsx",
        states: ["controlled", "disabled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "Viewport",
        expected: ["true", "false"],
        shown: [
          {
            value: "true",
            exampleId: "default",
            label: "Resources"
          },
          {
            value: "false",
            exampleId: "variants",
            label: "vertical / inline panel"
          }
        ]
      },
      {
        axis: "Orientation",
        expected: ["horizontal", "vertical"],
        shown: [
          {
            value: "horizontal",
            exampleId: "variants",
            label: "horizontal / inline panel"
          },
          {
            value: "vertical",
            exampleId: "variants",
            label: "vertical / inline panel"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Supply real hrefs and active-route state, group by destination hierarchy and keep the current location understandable without color."
      ],
      avoid: [
        "Use a navigation item for a destructive command or set every clicked item active without observing the router."
      ],
      decision:
        "Choose NavigationMenu for top-level destinations with optional descriptive panels. Use Menubar for commands.",
      rules: [
        {
          id: "navigation-menu-usage",
          when: "A destination has supporting links in a disclosure panel.",
          do: "Use real links for destinations and reserve the trigger for opening the panel.",
          avoid:
            "Use menu actions as destination links or make a heading-only trigger pretend to navigate.",
          reason: "Opening a panel and visiting a page are different actions.",
          evidence: [
            "src/components/v4/ui/navigation-menu.tsx",
            "src/pages/design-system/examples/navigation-menu/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Open a panel and follow its destination links with keyboard. Opening does not falsely navigate, and the current marker follows the real destination."
          }
        }
      ],
      states: [
        {
          state: "current",
          guidance: "Identify the actual current destination rather than the last hovered panel."
        },
        {
          state: "narrow",
          guidance: "Keep destination links reachable when the panel layout wraps."
        }
      ],
      antiSlop: [
        {
          do: "Group destinations by a clear information hierarchy.",
          avoid: "Put every product feature in an oversized promotional navigation panel.",
          reason:
            "A navigation panel should shorten route finding rather than become a second landing page."
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
          "npm run ui:dev; open /design-system#navigation-menu and verify the documented interaction."
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
      "Use tabs/value/onChange for a typed collection, or compose the retained Radix parts. Tabs and TabsList take the same variant, underline or segmented. underline draws a 2px ink line under the selected tab on a 1px track rule; segmented sits on a tint track and marks the selected tab with the shared selected paint. Both share one measured indicator. A count renders as a neutral Count chip. The panel sits 16px under the track. Overflow scrolls in the selected orientation and reveals the selected tab."
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
        command: "npm run ui:dev; open /design-system#tabs and verify the documented interaction."
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
      "Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.",
      "ContextMenu opens from its trigger's context action. Action items call onSelect and close; checkbox/radio items stay open unless closeOnSelect is true."
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
          "npm run ui:dev; open /design-system#context-menu and verify the documented interaction."
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
      "Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.",
      "Radix Root owns open/onOpenChange. Action items close after onSelect; checkbox/radio changes stay open by default and can opt into closeOnSelect."
    ],
    accessibility: [
      "A named trigger opens the menu. Typing a letter jumps to a matching item, arrow keys skip disabled items and focus returns to the trigger on close. Use checkbox or radio items for persistent selection."
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
          "npm run ui:dev; open /design-system#dropdown-menu and verify the documented interaction."
      }
    ]
  },
  {
    id: "menubar",
    title: "Menubar",
    group: "Actions",
    summary: "Group application menus with keyboard navigation.",
    sourceFiles: ["src/components/v4/ui/menubar.tsx"],
    exports: [
      "Menubar",
      "MenubarCheckboxItem",
      "MenubarContent",
      "MenubarGroup",
      "MenubarItem",
      "MenubarLabel",
      "MenubarMenu",
      "MenubarPortal",
      "MenubarRadioGroup",
      "MenubarRadioItem",
      "MenubarSeparator",
      "MenubarShortcut",
      "MenubarSub",
      "MenubarSubContent",
      "MenubarSubTrigger",
      "MenubarTrigger"
    ],
    referenceNames: ["Menubar"],
    behavior: [
      "Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.",
      "Each MenubarMenu owns a trigger and menu content. Action items close normally; checkbox/radio items remain open unless closeOnSelect requests dismissal."
    ],
    accessibility: [
      "Arrow keys move across the menu triggers and within each menu, skipping disabled items. Name icon-only triggers and distinguish an action from a checked selection."
    ],
    limitations: [
      "Menubar models application action menus, not primary website navigation; checked values and operations belong to the host."
    ],
    examples: [
      {
        id: "default",
        title: "File and view commands",
        module: "./examples/menubar/default.tsx",
        states: ["default", "disabled"]
      },
      {
        id: "states",
        title: "Checked states",
        module: "./examples/menubar/states.tsx",
        states: ["default", "disabled"]
      },
      {
        id: "placements",
        title: "Placements",
        module: "./examples/menubar/placements.tsx",
        states: ["default"]
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
        axis: "MenubarItem.variant",
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
        "Group commands by task, keep checked items under their proper radio or checkbox model and keep arrow-key movement between menus working."
      ],
      avoid: [
        "Use Menubar for website destinations or add a shortcut caption without implementing its action binding."
      ],
      decision:
        "Choose Menubar for a persistent desktop-style command surface. Use NavigationMenu for website destinations and DropdownMenu for a single object's actions.",
      rules: [
        {
          id: "menubar-usage",
          when: "The top row opens command menus rather than navigating to pages.",
          do: "Group related commands under specific menu names and keep checked preferences controlled.",
          avoid: "Use menuitem behavior for an ordinary collection of destination links.",
          reason: "Command menus have a keyboard model that differs from page navigation.",
          evidence: [
            "src/components/v4/ui/menubar.tsx",
            "src/pages/design-system/examples/menubar/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Open categories with keyboard, activate a command and change a checked preference; the row behaves as command menus rather than pretending to be ordinary page navigation."
          }
        }
      ],
      states: [
        {
          state: "checked",
          guidance: "Reflect the actual view preference in the checkbox or radio item."
        },
        {
          state: "disabled",
          guidance: "Keep unavailable commands meaningful and explain their prerequisite nearby."
        }
      ],
      antiSlop: [
        {
          do: "Keep a small stable set of command categories.",
          avoid: "Build a second application navigation bar from menus labeled after every page.",
          reason: "Competing navigation models make the current location harder to understand."
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
          "npm run ui:dev; open /design-system#menubar and verify the documented interaction."
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
      "Pending async commands reject duplicate activation, including the link shortcut; actual dialog close clears page, query and feedback before the next session."
    ],
    accessibility: [
      "Arrow keys move through commands and skip disabled ones. Escape leaves a nested page before it closes the menu. Mod+Enter opens an enabled link that is not pending in a new tab."
    ],
    limitations: [
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
          "npm run ui:dev; open /design-system#command-menu and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
