import { useState } from "react";

import { SensitiveEditor } from "@app/components/v4/ui/sensitive-editor";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [revision, setRevision] = useState(0);
  const [value, setValue] = useState("fabricated-example-only");
  return (
    <ExampleCell align="stretch" label="Reveal and replace">
      <SensitiveEditor
        stored={{ id: "fictional-value", revision: String(revision), hasValue: true }}
        label="Protected example value"
        onReveal={async () => value}
        onSave={async (draft) => {
          setValue(draft);
          setRevision((current) => current + 1);
        }}
      />
    </ExampleCell>
  );
}
