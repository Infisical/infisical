import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v4/ui/detail";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="Groups with headers and an edit action">
        <Card title="Gateway details">
          <DetailGroup>
            <DetailGroupHeader
              action={
                <Button variant="ghost" size="xs" icon="settings">
                  Edit
                </Button>
              }
            >
              General
            </DetailGroupHeader>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue>
                <code>3f8b2c1e-9d4a-4e7b-a6c2-5b1d0f9e8a77</code>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>
                eu-west-production-gateway-with-a-very-long-unbroken-identifier
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <Badge tone="ok" dot>
                  Healthy
                </Badge>
              </DetailValue>
            </Detail>
            <DetailGroupHeader
              action={
                <Button variant="ghost" size="xs" icon="settings" disabled>
                  Edit
                </Button>
              }
            >
              Authentication
            </DetailGroupHeader>
            <Detail>
              <DetailLabel>Machine identity</DetailLabel>
              <DetailValue>None</DetailValue>
            </Detail>
          </DetailGroup>
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="Loose details, no group">
        <Card>
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>Oct 12, 2026, 09:41</DetailValue>
          </Detail>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
