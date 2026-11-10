import * as React from "react";

import { Input } from "@app/components/v4/ui/input";
import { Highlight } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const variables = [
  "DATABASE_URL",
  "DATABASE_REPLICA_URL",
  "REDIS_URL",
  "SENTRY_DSN",
  "API_BASE_URL"
];

export default function Example() {
  const [query, setQuery] = React.useState("url");
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Every match, case-insensitive">
        <div className="flex flex-col gap-2">
          <Input
            aria-label="Search environment variables"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="flex flex-col gap-1 font-mono">
            {variables.map((name) => (
              <li key={name}>
                <Highlight text={name} query={query} />
              </li>
            ))}
          </ul>
        </div>
      </ExampleCell>
      <ExampleCell label="terms: each word on its own">
        <p>
          <Highlight
            text="Rotate the database password before the replica restarts"
            query="database replica"
            terms
          />
        </p>
      </ExampleCell>
      <ExampleCell label="Literal query, not a pattern">
        <p className="font-mono">
          <Highlight text="api.v1.(beta) and apixv1" query="api.v1.(beta)" />
        </p>
      </ExampleCell>
    </ExampleGrid>
  );
}
