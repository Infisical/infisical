import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { SecretInput } from "@app/components/v4/ui/secret-input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [token, setToken] = useState("fabricated-example-token-7f3a");
  const [certificate, setCertificate] = useState(
    "-----BEGIN EXAMPLE-----\nnot-a-real-certificate\n-----END EXAMPLE-----"
  );
  const [pasted, setPasted] = useState('API_URL=\u00a0"https://example.com"\u200b');
  const [empty, setEmpty] = useState("");
  return (
    <ExampleGrid>
      <ExampleCell label="Masked until focused">
        <Field label="Access token">
          <SecretInput value={token} onChange={setToken} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Empty, with placeholder">
        <Field label="Webhook secret">
          <SecretInput value={empty} onChange={setEmpty} placeholder="Paste a value" />
        </Field>
      </ExampleCell>
      <ExampleCell label="Multiline">
        <Field label="Certificate">
          <SecretInput multiline value={certificate} onChange={setCertificate} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Invisible characters warning">
        <Field label="Pasted value">
          <SecretInput value={pasted} onChange={setPasted} />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
