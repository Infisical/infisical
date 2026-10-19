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
        <Card title="Posture" action={<a href="#card">View report</a>}>
          412 secrets across 3 environments. 3 are missing in production and 5 rotations are due
          this week.
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="framed, no header, with footer">
        <Card footer="Expires in 7 days.">
          <div className="flex items-center gap-3">
            <Media icon="key" />
            <span>Read access to staging, scoped to the payments project.</span>
          </div>
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
