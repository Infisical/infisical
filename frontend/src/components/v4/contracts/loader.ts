import type { ComponentDefinition } from "./types";

export const loaderDefinition = {
  id: "loader",
  title: "Loader",
  group: "Feedback",
  summary:
    "Loaders by level: BootLoader while the app or session boots, RouteProgress while a navigation resolves, and Loader for a page or a region of unknown shape.",
  sourceFiles: [
    "src/components/v4/ui/loader.tsx",
    "src/components/v4/ui/loader.module.css",
    "src/components/v4/ui/boot-loader.tsx",
    "src/components/v4/ui/boot-loader.module.css",
    "src/components/v4/ui/route-progress.tsx",
    "src/components/v4/ui/route-progress.module.css",
    "src/components/v4/lib/boot-theme.ts"
  ],
  exports: ["Loader", "BootLoader", "RouteProgress"],
  referenceNames: ["Loader", "BootLoader", "RouteProgress"],
  behavior: [
    "Loader composes Spinner with its label, description and delay; it adds the area that centers it and marks the region busy.",
    "With loading false it renders its children and nothing else.",
    "The default delay of 300ms keeps fast loads from flashing.",
    "Loader is for content whose shape is unknown. When the loaded shape is known (rows, cards, a chart), show Skeleton shapes that match the loaded state instead, as the reload in the example does.",
    "Size page is the page loader: it fills a page body while the page or its lazy chunk loads, before any of the page is on screen.",
    "BootLoader is the page loader for app and session boot, before the shell exists: the router's root pending state and a route that authenticates the session or loads the organization. It fills the viewport, or its container with fill container, and themes itself from storage the way the app theme does (a ?theme= or session preview outside live orgs, else the named theme for the scheme the shared light, dark or system preference resolves to), so it needs no V4Scope. A theme prop pins one theme.",
    "Before any JavaScript runs, index.html paints the same ground on /v4 paths: a generated inline script resolves the theme with the same rules and sets data-v4-boot on the html element, and a generated style gives each theme its inset ground and color scheme, so a dark theme never flashes white. Other paths are untouched, and the app removes the attribute once the first route resolves. ui:generate writes the block from tokens.json.",
    "RouteProgress is a size-space-2 ink bar along the top of the viewport while the TanStack router is pending. It appears only after duration-slow, so instant navigations show nothing, then creeps toward nine tenths of the width; when the navigation resolves it fills and fades out. Reduced motion shows a still full-width bar instead. pending overrides the router state."
  ],
  accessibility: [
    "Spinner's label carries one polite status announcement; the region sets aria-busy while loading.",
    "BootLoader announces its label through the same Spinner status.",
    "RouteProgress is aria-hidden: the destination page's title and its own loader announce the change, so the bar adds no second announcement."
  ],
  limitations: [
    "For an inline status beside text, use Spinner with a label directly; Loader only fills areas.",
    "Use Progress for a known count and Skeleton for a known layout. A blanket Loader over rows, cards or a chart whose shape is known is a misuse.",
    "The boot ground in index.html cannot evaluate the v4 feature flag, so it applies to /v4 paths only; a flag-on visit to a main path paints main's ground until the redirect to /v4.",
    "RouteProgress mounts once, inside the v4 root; it reads the router it is rendered under and does not cover the v3 app, which keeps NProgress."
  ],
  examples: [
    {
      id: "default",
      title: "Base, page and a skeleton reload",
      module: "./examples/loader/default.tsx",
      states: ["loading", "default"]
    },
    {
      id: "boot",
      title: "Boot loader in peach and dark",
      module: "./examples/loader/boot.tsx",
      states: ["loading"]
    },
    {
      id: "route-progress",
      title: "Route progress",
      module: "./examples/loader/route-progress.tsx",
      states: ["loading", "default"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["base", "page"],
      shown: [
        {
          value: "base",
          exampleId: "default",
          label: "base"
        },
        {
          value: "page",
          exampleId: "default",
          label: "page"
        }
      ]
    },
    {
      axis: "level",
      expected: ["boot", "route", "page", "region"],
      shown: [
        { value: "boot", exampleId: "boot", label: "Boot, Lightly Peach" },
        {
          value: "route",
          exampleId: "route-progress",
          label: "Route progress while a navigation resolves"
        },
        { value: "page", exampleId: "default", label: "page" },
        { value: "region", exampleId: "default", label: "base" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use the page loader (size page) as the Suspense fallback for a page or a lazy page chunk, and for a page whose first data has not arrived, labeled with the page it loads.",
      "Use Loader at base size around a card, panel or sheet of unknown shape while its first data loads, with a label that names the object.",
      "Use BootLoader for the root pending state on /v4 and for routes that boot the session or the organization, before the shell renders.",
      "Mount one RouteProgress in the v4 root for in-app navigations."
    ],
    avoid: [
      "Nest a Loader inside a page Loader, or put one inside a button.",
      "Cover a table that is already on screen with a Loader; use its loading rows."
    ],
    decision:
      "Page loader, Skeleton or the table's loading rows: while a whole page or its chunk loads and none of it is on screen, use the page loader. Once the page has rendered, show Skeleton shapes for a card, panel or chart of known shape, and the table's loading rows (DataTable loading with loadingRows) for rows inside a table that is on screen. Use Spinner with a label for inline status and Progress for a known count.",
    rules: [
      {
        id: "loader-label",
        when: "A region shows a Loader.",
        do: "Pass a present participle that names the object, such as Loading secrets.",
        avoid: "Use a bare Loading label or no label at all.",
        reason: "People need to know what is loading and where it will appear.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read each Loader label and check that it names what loads."
        }
      },
      {
        id: "loader-unknown-shape",
        when: "A region is waiting for data.",
        do: "Use Loader only when the shape of the result is unknown. When it is known, show Skeleton shapes like the loaded state and announce the wait with a status.",
        avoid: "Cover known rows, cards or a chart with a blanket Loader.",
        reason:
          "Matching shapes keep the layout still and show what is coming; a centered spinner hides both.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "For each Loader, check whether the loaded content has a known shape. If it does, replace the Loader with Skeleton shapes at the same size."
        }
      },
      {
        id: "loader-page-level",
        when: "A whole page, or the lazy chunk that renders it, is loading and none of it is on screen yet.",
        do: "Render the page loader, Loader size page, as the Suspense fallback or the page body, labeled with the page it loads.",
        avoid:
          "Show a Spinner, bare Loading text or a blank area, or put the page loader over a table or region inside a page that has already rendered.",
        reason:
          "One page-level treatment tells people the whole page is on its way; inside a rendered page, Skeleton and the table's loading rows keep the layout still.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Check each Suspense fallback and page-level loading branch renders Loader size page; the suspense-fallback lint check of rule/page-loading catches single-line fallbacks."
        }
      },
      {
        id: "loader-boot-level",
        when: "The app or the session is booting and no shell is on screen: the root route's pending state on /v4, the auth layout, or the organization route that authenticates and loads the session.",
        do: "Render BootLoader with a label that names what boots, such as Loading Infisical, Loading sign in or Loading your organization.",
        avoid:
          "Wrap a Loader in a V4Scope of your own for boot, label it Loading, or use BootLoader for a page inside the shell, where the page loader sits in the content area.",
        reason:
          "BootLoader themes itself before V4Scope exists and matches the pre-JavaScript ground, so boot goes from the HTML to the shell on one ground with one label.",
        evidence: [
          "src/components/v4/ui/boot-loader.tsx",
          "src/pages/design-system/examples/loader/boot.tsx"
        ],
        detect: {
          by: "review",
          how: "Cold-load a /v4 route with a dark theme and a slow network: the ground is dark from the first paint, the boot label names what loads, and no v3 loader shows."
        }
      },
      {
        id: "loader-route-progress",
        when: "A navigation inside the v4 app waits on route loaders or a lazy route chunk.",
        do: "Let the one RouteProgress in the v4 root show the wait, and keep the current page on screen until the next one renders.",
        avoid:
          "Mount a second progress bar, drive NProgress on /v4 paths, or replace the shell with a page loader for an ordinary navigation.",
        reason:
          "A thin bar that appears only for slow navigations says the click registered without moving or hiding the page.",
        evidence: [
          "src/components/v4/ui/route-progress.tsx",
          "src/pages/design-system/examples/loader/route-progress.tsx"
        ],
        detect: {
          by: "review",
          how: "Navigate between v4 pages on a throttled network: one ink bar appears at the top after a moment and fades when the page renders, and the v3 NProgress bar never shows."
        }
      },
      {
        id: "loader-reconcile",
        when: "Text near the region already says what is happening.",
        do: "Use a bare Spinner or Spinner with a label instead of a Loader.",
        avoid: "Add a second Loader inside a region that already shows one.",
        reason: "One loader per region keeps a single status announcement.",
        evidence: ["src/components/v4/ui/loader.tsx"],
        detect: {
          by: "review",
          how: "Search the region for nested Loader or Spinner status elements."
        }
      }
    ],
    states: [
      {
        state: "loading",
        guidance: "The Spinner centers in the region after the delay, with its label under it."
      },
      {
        state: "loaded",
        guidance: "The children replace the Loader in place."
      }
    ],
    antiSlop: [
      {
        do: "Keep the page loader's assembly as the one entrance flourish.",
        avoid: "Restart the page loader every time data refreshes.",
        reason: "Replaying the assembly reads as a new load."
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
      command: "npm run dev; open /design-system#loader and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
