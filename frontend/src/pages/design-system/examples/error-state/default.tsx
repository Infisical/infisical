import { useState } from "react";

import { ErrorState, type ErrorStatePreset } from "@app/components/v4/patterns/error-state";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

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
    <ExampleGrid width="full">
      <ExampleCell label="not-found, in the shell" align="stretch">
        <ExampleStage height="app">
          <Shell preset="not-found" />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="crash, in the shell" align="stretch">
        <ExampleStage height="app">
          <Shell preset="crash" />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="not-found, full-page" align="stretch">
        <ExampleStage height="app">
          <ErrorState
            preset="not-found"
            layout="full-page"
            homeHref="#error-state"
            onBack={() => {}}
          />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="crash, full-page" align="stretch">
        <ExampleStage height="app">
          <ErrorState
            preset="crash"
            layout="full-page"
            homeHref="#error-state"
            error={sampleError}
            details={details}
            showStack
            onReload={() => {}}
          />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
