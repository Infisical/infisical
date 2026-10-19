import { Button } from "@app/components/v4/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@app/components/v4/ui/card";
import { Media } from "@app/components/v4/ui/item";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="framed">
        <Card
          title="Staging service"
          description="Read access to staging."
          media={<Media icon="key" />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <a href="#field">Settings</a>
            </Button>
          }
          footer="Expires in 7 days."
        >
          Scoped to the payments project.
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="plain">
        <Card variant="plain">
          <CardHeader>
            <CardTitle>Environment defaults</CardTitle>
            <CardDescription>Inherited by new connections.</CardDescription>
          </CardHeader>
          <CardContent>The default environment is staging.</CardContent>
          <CardFooter>Updated today</CardFooter>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
