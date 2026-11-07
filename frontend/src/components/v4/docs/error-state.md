# Error state

The 404 and crash fallback, inside the shell or as a full page.

## Choose this component

Choose ErrorState when the whole page cannot render. Use EmptyState for an empty list and Alert for an error inside a page that still works.

## Usage rules

### error-state-host-owns-reporting

Owner: error-state.

When a route error reaches the fallback.

Do: Pass the error, the request id and route as details, and send the error to reporting from onReport.

Avoid: Import Sentry, PostHog or axios into the pattern, or report from the pattern itself.

Why: The v4 bundle fence keeps app imports out of components/v4, and the host is the one that knows which errors to classify and report.

Checked by: review only. Look for: Read the route's errorComponent: it passes error, details and onReport, and the pattern imports nothing from @app outside components/v4.

Source evidence:
- src/components/v4/patterns/error-state.tsx
- src/pages/design-system/examples/error-state/default.tsx

## State guidance

- error: Keep Error details closed by default; it carries the message, the request id and, in development, the stack.

## Presentation rules

Do: Say what happened in one short line.

Avoid: Write a headline joke or a reassurance line about secrets.

Why: The page only needs to say what broke and where to go next.

## Import and exports

- src/components/v4/patterns/error-state.tsx
- src/components/v4/patterns/error-state.module.css

Exports: ErrorState. Source TypeScript defines the API.

## Behavior

- preset not-found shows Page not found, one line, an accent Go to organization home link and Go back. preset crash shows Something went wrong, one line, an accent Reload, Go to organization home and a closed Error details disclosure.
- layout auto renders in the content area when an AppShell is above it, so the sidebar and top bar stay, and full-page when there is none, such as when the shell itself failed. full-page is fixed over its containing block: the viewport in the app, the stage in the workbench. Pass in-shell or full-page to force one.
- Error details holds one mono block with the error name and message, each details line (request id, status, route, time) and, in development builds or with showStack, the stack. Its Copy details button copies that same text.
- A quiet cell mark sits above the title: for not-found one cell is a dashed gap, for crash one accent cell is knocked out of the grid.
- onReport runs once per error when crash mounts, so the host can send it to error reporting. homeHref defaults to /; onHome runs before the link navigates. onBack and onReload default to history back and a full reload.

## Accessibility

- The title is the page's h1. Actions are a real link and buttons, and Error details is a disclosure button with aria-expanded.

## Use cases

- Use ErrorState as the route notFoundComponent and errorComponent, and for a resource the API says does not exist.

## Avoid

- Add a second description, a status badge, a joke headline or marketing copy, or show the stack in production.

## Limits

- ErrorState imports nothing from the app. The host classifies the error (403 pages, project access), reads the request id from the response, sets the page title and reports to Sentry or PostHog through onReport.
- full-page needs V4Scope above it for tokens; inside the v4 app the root route already provides it.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### preset

- not-found: example `default`, visible label "not-found, in the shell".
- crash: example `default`, visible label "crash, in the shell".

### layout

- in-shell: example `default`, visible label "crash, in the shell".
- full-page: example `default`, visible label "crash, full-page".

## Executable examples

### Not found and crash

Save this example at `src/pages/design-system/examples/error-state/default.tsx`; its relative imports are generated for that exact path. States: default, error.

Registry items used: @infisical/error-state, @infisical/sidebar, @infisical/top-bar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { ErrorState, type ErrorStatePreset } from "../../../../components/v4/patterns/error-state";
import { Sidebar } from "../../../../components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "../../../../components/v4/ui/top-bar";

const sampleError = Object.assign(
  new TypeError("Cannot read properties of undefined (reading 'environments')"),
  {
    stack:
      "TypeError: Cannot read properties of undefined (reading 'environments')\n    at OverviewPage (OverviewPage.tsx:212:31)\n    at renderWithHooks (react-dom.development.js:15486:18)"
  }
);

const details = [
  { label: "request", value: "req-5f3a9c2e81b4" },
  { label: "route", value: "/organizations/acme/projects/secret-management/payments-api/overview" },
  { label: "time", value: "2026-11-07 14:32:08 UTC" }
];

const Shell = ({ preset }: { preset: ErrorStatePreset }) => {
  const [current, setCurrent] = useState("projects");
  return (
    <AppShell>
      <TopBar breadcrumb={[{ label: "Acme Corp", href: "#error-state" }]} />
      <Sidebar
        sections={[
          {
            items: [
              { id: "home", label: "Home", icon: "home" },
              { id: "projects", label: "Projects", icon: "folder" },
              { id: "settings", label: "Settings", icon: "settings" }
            ]
          }
        ]}
        current={current}
        onNavigate={(item) => setCurrent(item.id)}
      />
      <AppInset>
        <PageGutter>
          <ErrorState
            preset={preset}
            homeHref="#error-state"
            error={preset === "crash" ? sampleError : undefined}
            details={preset === "crash" ? details : undefined}
            showStack
            onReload={() => {}}
            onBack={() => {}}
          />
        </PageGutter>
      </AppInset>
    </AppShell>
  );
};

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Shell preset="not-found" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"not-found, in the shell"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Shell preset="crash" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"crash, in the shell"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <ErrorState
              preset="not-found"
              layout="full-page"
              homeHref="#error-state"
              onBack={() => {}}
            />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"not-found, full-page"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <ErrorState
              preset="crash"
              layout="full-page"
              homeHref="#error-state"
              error={sampleError}
              details={details}
              showStack
              onReload={() => {}}
            />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"crash, full-page"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#error-state and exercise the documented interaction.
