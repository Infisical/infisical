import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [filtered, setFiltered] = useState(true);
  return (
    <ExampleGrid width="full">
      <ExampleCell label="default">
        <EmptyState
          title="No connections yet"
          description="Connections share versions with your services."
          actions={
            <Button asChild>
              <a href="#select">Choose a provider</a>
            </Button>
          }
        />
      </ExampleCell>
      <ExampleCell label={filtered ? "compact" : "Filtered result"}>
        {filtered ? (
          <EmptyState
            variant="compact"
            title="No matching connections"
            actions={
              <Button variant="link" onClick={() => setFiltered(false)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <p role="status" className="text-sm">
            1 connection, Staging service
          </p>
        )}
      </ExampleCell>
      <ExampleCell label="Request failed">
        <EmptyState variant="compact" title="Connections could not load" />
      </ExampleCell>
    </ExampleGrid>
  );
}
