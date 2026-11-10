import { Tabs } from "@app/components/v4/ui/tabs";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="underline" align="stretch">
        <Tabs
          label="Secret sections"
          tabs={[
            { value: "overview", label: "Overview", content: "Value, comment and tags." },
            { value: "versions", label: "Versions", count: 15, content: "15 versions." },
            { value: "syncs", label: "Syncs", count: 3, content: "3 synced destinations." },
            {
              value: "policy",
              label: "Policy",
              disabled: true,
              content: "Unavailable on this plan."
            }
          ]}
        />
      </ExampleCell>
      <ExampleCell label="segmented" align="stretch">
        <Tabs
          label="Environment"
          variant="segmented"
          tabs={[
            { value: "staging", label: "Staging", count: 12, content: "12 staging connections." },
            {
              value: "production",
              label: "Production",
              count: 4,
              content: "4 production connections."
            }
          ]}
        />
      </ExampleCell>
      <ExampleCell label="segmented, full width" align="stretch">
        <Tabs
          label="Plan"
          variant="segmented"
          width="full"
          tabs={[
            { value: "pro", label: "Pro", content: "Pro features." },
            { value: "advanced", label: "Advanced", content: "Advanced features." },
            { value: "enterprise", label: "Enterprise", content: "Enterprise features." }
          ]}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
