import { useState } from "react";

import { ErrorState } from "@app/components/v4/patterns/error-state";
import { Button } from "@app/components/v4/ui/button";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

export default function Example() {
  const [current, setCurrent] = useState("projects");
  const [requested, setRequested] = useState(false);
  return (
    <ExampleGrid width="full">
      <ExampleCell label="forbidden, in the shell, with Request access" align="stretch">
        <ExampleStage height="app">
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
                  preset="forbidden"
                  homeHref="#error-state"
                  onBack={() => {}}
                  actions={
                    <Button
                      variant="outline"
                      disabledReason={
                        requested ? "Access requested. An admin will review it." : undefined
                      }
                      onClick={() => setRequested(true)}
                    >
                      {requested ? "Access requested" : "Request access"}
                    </Button>
                  }
                />
              </PageGutter>
            </AppInset>
          </AppShell>
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
