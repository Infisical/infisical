import { Progress, ProgressSteps } from "@app/components/v4/ui/progress";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["ink", "warn", "bad", "auto"] as const).map((tone) => (
        <ExampleCell align="stretch" key={tone} label={tone}>
          <Progress
            tone={tone}
            value={80}
            label="Records synchronized"
            valueLabel="80 of 100 records"
          />
        </ExampleCell>
      ))}
      {[0, 79, 80, 100, 112].map((value) => (
        <Progress
          key={value}
          tone="auto"
          value={value}
          label={`Usage ${value}%`}
          valueLabel={`${value} of 100 records`}
        />
      ))}
      <ExampleCell align="stretch" label="Checking connection">
        <Progress label="Checking connection" value={null} valueLabel="Waiting for provider" />
      </ExampleCell>
      {[0, 1, 2, 3].map((current) => (
        <ExampleCell
          align="stretch"
          key={current}
          label={["First stage", "Middle stage", "Last stage", "Complete"][current]}
        >
          <ProgressSteps
            steps={["Connect", "Validate", "Import"]}
            current={current}
            label={current === 3 ? "Import complete" : "Import stages"}
          />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
