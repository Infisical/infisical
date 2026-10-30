import { Button } from "@app/components/v4/ui/button";
import { Container, Grid, Inline, Measure, Stack } from "@app/components/v4/ui/layout";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const tile = "bg-muted px-3 py-2 text-center";

export default function Example() {
  return (
    <Container>
      <ExampleGrid width="full">
        <ExampleCell align="stretch" label="Stack">
          <Stack gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Stack>
        </ExampleCell>
        <ExampleCell align="stretch" label="Inline, wraps when the row runs out of room">
          <Inline gap={8}>
            <Button variant="outline">Form guide</Button>
            <Button variant="outline">Input guide</Button>
            <Button variant="outline">Typography</Button>
          </Inline>
        </ExampleCell>
        <ExampleCell align="stretch" label="3 columns">
          <Grid columns={3} gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Grid>
        </ExampleCell>
        <ExampleCell align="stretch" label="auto-fit">
          <Grid gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Grid>
        </ExampleCell>
        {(["page", "form", "prose"] as const).map((size) => (
          <ExampleCell align="stretch" key={size} label={size}>
            <div className="border border-dashed border-border">
              <Measure size={size}>
                <span className={`${tile} block`}>Content stops at the {size} measure</span>
              </Measure>
            </div>
          </ExampleCell>
        ))}
      </ExampleGrid>
    </Container>
  );
}
