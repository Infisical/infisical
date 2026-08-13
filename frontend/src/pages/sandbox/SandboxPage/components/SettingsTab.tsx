import { BoxIcon, NetworkIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { TSandbox } from "@app/hooks/api/sandboxes";

import { AgentTab } from "./AgentTab";
import { TopologyTab } from "./topology";

/** Configuration and the picture of what that configuration produced, side by side. */
export const SettingsTab = ({ sandbox }: { sandbox: TSandbox }) => (
  <Tabs defaultValue="agent" className="flex flex-col gap-4">
    <TabsList>
      <TabsTrigger value="agent">
        <BoxIcon className="size-4" />
        Agent
      </TabsTrigger>
      <TabsTrigger value="topology">
        <NetworkIcon className="size-4" />
        Topology
      </TabsTrigger>
    </TabsList>

    <TabsContent value="agent">
      <AgentTab sandbox={sandbox} />
    </TabsContent>
    <TabsContent value="topology">
      <TopologyTab sandbox={sandbox} />
    </TabsContent>
  </Tabs>
);
