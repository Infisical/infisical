import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { GlobPatternHelp, SecretPathInput } from "@app/components/v4/ui/secret-path-input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const tree: Record<string, string[]> = {
  "/": ["app", "billing", "infrastructure-shared-configuration-for-all-regions"],
  "/app": ["api", "web", "worker"],
  "/app/api": ["v1", "v2"],
  "/billing": ["stripe"]
};

export default function Example() {
  const [path, setPath] = useState("/app/");
  const [parent, setParent] = useState("/");
  const [scope, setScope] = useState("/app/**");
  const [scopeParent, setScopeParent] = useState("/");
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Suggests child folders after each slash">
        <Field label="Secret path">
          <SecretPathInput
            value={path}
            onChange={setPath}
            folders={tree[parent]}
            onParentPathChange={setParent}
          />
        </Field>
      </ExampleCell>
      <ExampleCell align="stretch" label="Glob value, no suggestions">
        <Field label="Folder scope" help={<GlobPatternHelp />}>
          <SecretPathInput
            value={scope}
            onChange={setScope}
            folders={tree[scopeParent]}
            onParentPathChange={setScopeParent}
          />
        </Field>
      </ExampleCell>
      <ExampleCell align="stretch" label="Disabled">
        <Field label="Source path">
          <SecretPathInput defaultValue="/billing/stripe" disabled />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
