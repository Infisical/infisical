import * as React from "react";

import { Label } from "@app/components/v4/ui/label";
import { Textarea } from "@app/components/v4/ui/textarea";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = React.useState("");
  return (
    <ExampleGrid>
      <div className="space-y-2">
        <Label htmlFor="rows-default">Note</Label>
        <Textarea id="rows-default" placeholder="Add a note" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rows-six">Certificate chain</Label>
        <Textarea
          id="rows-six"
          rows={6}
          mono
          placeholder="Paste a PEM certificate chain"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </ExampleGrid>
  );
}
