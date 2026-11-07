import { ErrorState } from "@app/components/v4/patterns/error-state";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const frames = Array.from(
  { length: 28 },
  (_, index) =>
    `    at Component${index + 1} (src/pages/v4/secret-manager/OverviewPage/OverviewPage.tsx:${200 + index * 7}:${10 + index})`
);
const longError = Object.assign(
  new TypeError("Cannot read properties of undefined (reading 'environments')"),
  {
    stack: [
      `TypeError: Cannot read properties of undefined (reading 'environments')`,
      ...frames
    ].join("\n")
  }
);

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="crash, full-page, long stack in a short stage" align="stretch">
        <ExampleStage height="medium">
          <ErrorState
            preset="crash"
            layout="full-page"
            homeHref="#error-state"
            error={longError}
            details={[{ label: "request", value: "req-5f3a9c2e81b4" }]}
            showStack
            onReload={() => {}}
          />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
