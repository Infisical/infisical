import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dialog";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Corner close, for read-only or informational dialogs">
        <UI.Dialog>
          <UI.DialogTrigger asChild>
            <Button variant="outline">Corner close</Button>
          </UI.DialogTrigger>
          <UI.DialogContent>
            <UI.DialogHeader>
              <UI.DialogTitle>Environment details</UI.DialogTitle>
              <UI.DialogDescription>Read-only details for Staging.</UI.DialogDescription>
            </UI.DialogHeader>
            <p>Region: eu-west-1. Access: Platform team.</p>
          </UI.DialogContent>
        </UI.Dialog>
      </ExampleCell>
      <ExampleCell label="Footer close, when the dialog ends in actions">
        <UI.Dialog>
          <UI.DialogTrigger asChild>
            <Button variant="outline">Footer close</Button>
          </UI.DialogTrigger>
          <UI.DialogContent showCloseButton={false}>
            <UI.DialogHeader>
              <UI.DialogTitle>Environment details</UI.DialogTitle>
              <UI.DialogDescription>Read-only details for Staging.</UI.DialogDescription>
            </UI.DialogHeader>
            <p>Region: eu-west-1. Access: Platform team.</p>
            <UI.DialogFooter showCloseButton />
          </UI.DialogContent>
        </UI.Dialog>
      </ExampleCell>
    </ExampleGrid>
  );
}
