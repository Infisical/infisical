import { Badge } from "@app/components/v4/ui/badge";
import { type DataListItem, DataList } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const items: DataListItem[] = [
  ["ID", <code key="id">4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11</code>],
  ["Managed by", "Organization", { span: "half" }],
  ["Organization role", "Member", { span: "half" }],
  [
    "Status",
    <Badge key="status" tone="ok" dot>
      Active
    </Badge>,
    { span: "half" }
  ],
  ["Delete protection", "On", { span: "half" }],
  ["Extended key usage", "Server authentication, client authentication"],
  ["Country", "CA", { span: "half" }],
  ["Last login", "Never"]
];

export default function Density() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="default">
        <DataList variant="props" items={items} />
      </ExampleCell>
      <ExampleCell align="stretch" label="compact, half pairs and a lone half">
        <DataList variant="props" density="compact" items={items} />
      </ExampleCell>
    </ExampleGrid>
  );
}
