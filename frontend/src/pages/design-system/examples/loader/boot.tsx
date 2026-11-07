import { BootLoader } from "@app/components/v4/ui/boot-loader";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      {["peach", "dark"].map((theme) => (
        <ExampleCell key={theme} label={`Boot, ${theme}`} align="stretch">
          <div className="h-80">
            <BootLoader theme={theme} fill="container" label="Loading Infisical" delay={0} />
          </div>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
