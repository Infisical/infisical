import { useState } from "react";
import { Helmet } from "react-helmet";
import { Plus, RotateCw } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { Button, UnstableIconButton } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { ObservabilityDashboard } from "./components/ObservabilityDashboard";

export const ObservabilityPage = () => {
  const { isSubOrganization } = useOrganization();
  const [refreshKey, setRefreshKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <>
      <Helmet>
        <title>Infisical | Observability</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="Observability"
            description="Monitor and visualize organization activity, secrets access, and system health"
          >
            <UnstableIconButton variant="outline" size="md" onClick={handleRefresh}>
              <RotateCw />
            </UnstableIconButton>
            <Button variant="org" size="md" onClick={() => setPanelOpen(true)}>
              <Plus />
              Add Widget
            </Button>
          </PageHeader>
          <ObservabilityDashboard
            key={refreshKey}
            panelOpen={panelOpen}
            onPanelOpenChange={setPanelOpen}
          />
        </div>
      </div>
    </>
  );
};
