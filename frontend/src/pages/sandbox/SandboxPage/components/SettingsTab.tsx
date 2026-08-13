import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { TSandbox } from "@app/hooks/api/sandboxes";

import { AgentTab } from "./AgentTab";
import { TopologyTab } from "./topology";

const TABS = [
  { key: "agent", label: "Agent" },
  { key: "topology", label: "Topology" }
];

/** Underline tabs above the card, the same shape the networking and access control pages use. */
export const SettingsTab = ({ sandbox }: { sandbox: TSandbox }) => (
  <Tabs defaultValue="agent">
    <TabsList variant="project">
      {TABS.map(({ key, label }) => (
        <TabsTrigger key={key} value={key}>
          {label}
        </TabsTrigger>
      ))}
    </TabsList>

    <TabsContent value="agent">
      <AgentTab sandbox={sandbox} />
    </TabsContent>
    <TabsContent value="topology">
      <TopologyTab sandbox={sandbox} />
    </TabsContent>
  </Tabs>
);
