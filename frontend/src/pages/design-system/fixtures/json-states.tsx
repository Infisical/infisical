import { Json } from "@app/components/v4/ui/json";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Scalar and null">
        <Json value={null} />
        <Json value="9007199254740993" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Empty collections">
        <Json value={[]} />
        <Json value={{}} />
      </ExampleCell>
      <ExampleCell align="stretch" label="Collapsed root">
        <Json defaultExpandDepth={0} value={{ environment: "staging", enabled: true }} />
      </ExampleCell>
      <ExampleCell align="stretch" label="Predicate redaction">
        <Json
          value={{ publicId: "project_staging", privateToken: "synthetic-token" }}
          redact={(key) => key.toLowerCase().includes("token")}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Preview limits">
        <Json
          value={{ project: { configuration: { retention: { days: 30 } } }, events: [1, 2, 3] }}
          maxDepth={1}
          maxNodes={3}
          defaultExpandDepth={5}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Bounded JSON">
        <Json
          maxLines={4}
          value={{
            environments: ["development", "staging", "production"],
            retentionDays: 30,
            rotationEnabled: true
          }}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Wrapped long value">
        <Json
          wrap
          maxHeight={160}
          value={{
            path: "applications/staging/services/payment-processing/configuration/retention-policy"
          }}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
