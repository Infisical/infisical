import { Avatar } from "@app/components/v4/ui/avatar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const identities = [
  { kind: "person", name: "Ada Morgan" },
  { kind: "machine", name: "Deployment service" },
  { kind: "agent", name: "Rotation agent" },
  { kind: "fallback", name: "Unknown member" }
] as const;
export default function Example() {
  return (
    <ExampleGrid width="compact">
      {identities.map(({ kind, name }) => (
        <ExampleCell key={kind} label={kind}>
          <Avatar kind={kind} name={name} />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
