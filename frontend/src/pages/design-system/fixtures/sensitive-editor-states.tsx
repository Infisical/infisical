import * as React from "react";

import { CopyButton, SecretInput, SensitiveEditor } from "@app/components/v4/ui/sensitive-editor";

import { ExampleCell, ExampleGrid, ExampleStack } from "../example-presentation";

function Capability({
  label,
  hasValue = true,
  reveal = true,
  edit = true,
  readOnly = false,
  copyable = true
}: {
  label: string;
  hasValue?: boolean;
  reveal?: boolean;
  edit?: boolean;
  readOnly?: boolean;
  copyable?: boolean;
}) {
  const [stored, setStored] = React.useState({ id: label, revision: "0", hasValue });
  const [value, setValue] = React.useState("fabricated-single-line-value");
  return (
    <SensitiveEditor
      stored={stored}
      label={label}
      readOnly={readOnly}
      copyable={copyable}
      onReveal={reveal ? async () => value : undefined}
      onSave={
        edit
          ? async (draft) => {
              setValue(draft);
              setStored((current) => ({
                ...current,
                revision: String(Number(current.revision) + 1),
                hasValue: true
              }));
            }
          : undefined
      }
    />
  );
}
export default function States() {
  return (
    <ExampleStack>
      <p className="text-muted-foreground text-sm">Example values are fabricated.</p>
      <ExampleGrid width="compact">
        {(["sm", "md", "lg"] as const).map((size) => (
          <ExampleCell align="stretch" key={size} label={size}>
            <CopyButton
              size={size}
              value="fabricated-resource-id"
              label={`Copy identifier, ${size}`}
            />
          </ExampleCell>
        ))}
      </ExampleGrid>
      <ExampleGrid>
        {[
          { label: "Empty value", hasValue: false },
          { label: "Single-line value" },
          { label: "Read-only value", readOnly: true },
          { label: "Reveal only", edit: false },
          { label: "Replace without view permission", reveal: false },
          { label: "No reveal or edit permission", reveal: false, edit: false },
          { label: "Copy restricted", copyable: false }
        ].map((props) => (
          <ExampleCell align="stretch" key={props.label} label={props.label}>
            <Capability {...props} />
          </ExampleCell>
        ))}
        <ExampleCell align="stretch" label="Reveal pending">
          <SensitiveEditor
            stored={{ id: "pending-value", revision: "0", hasValue: true }}
            label="Pending example value"
            onReveal={async ({ signal }) => {
              await new Promise((resolve) => {
                setTimeout(resolve, 700);
              });
              if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
              return "fabricated-delayed-value";
            }}
          />
        </ExampleCell>
        <ExampleCell align="stretch" label="Reveal unavailable">
          <SensitiveEditor
            stored={{ id: "unavailable-value", revision: "0", hasValue: true }}
            label="Unavailable example value"
            onReveal={async () => {
              throw new Error("Value unavailable");
            }}
          />
        </ExampleCell>
        <ExampleCell align="stretch" label="Host-held plaintext, read-only">
          <SecretInput
            label="Host-held example"
            value="fabricated-read-only-value"
            copyable={false}
          />
        </ExampleCell>
      </ExampleGrid>
    </ExampleStack>
  );
}
