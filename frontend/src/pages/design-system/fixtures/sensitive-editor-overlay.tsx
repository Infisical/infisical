import * as React from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@app/components/v4/ui/dialog";
import { SensitiveEditor } from "@app/components/v4/ui/sensitive-editor";

export default function Overlay() {
  const [value, setValue] = React.useState("fabricated-overlay-value");
  const [revision, setRevision] = React.useState(0);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Open protected value">
          Open value
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Protected rotation value</DialogTitle>
        <DialogDescription>Fabricated value. Copy is restricted.</DialogDescription>
        <SensitiveEditor
          label="Overlay value"
          stored={{ id: "overlay", revision: String(revision), hasValue: true }}
          copyable={false}
          onReveal={async () => value}
          onSave={async (draft) => {
            setValue(draft);
            setRevision((current) => current + 1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
