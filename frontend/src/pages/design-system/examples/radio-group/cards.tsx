import { useState } from "react";

import { Icon } from "@app/components/v4/ui/icon";
import { RadioGroup, RadioGroupCard } from "@app/components/v4/ui/radio-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [protocol, setProtocol] = useState("saml");
  const [expiry, setExpiry] = useState<string>();
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Media and description, one disabled">
        <RadioGroup
          aria-label="Single sign-on protocol"
          value={protocol}
          onValueChange={setProtocol}
          className="grid-cols-1 sm:grid-cols-3"
        >
          <RadioGroupCard
            value="saml"
            title="SAML"
            description="Okta, Microsoft Entra ID, JumpCloud and other SAML 2.0 identity providers."
            media={<Icon name="building" />}
          />
          <RadioGroupCard
            value="oidc"
            title="OIDC"
            description="Any OpenID Connect provider with a discovery URL."
            media={<Icon name="globe" />}
          />
          <RadioGroupCard
            value="ldap"
            title="LDAP"
            description="Available on the Enterprise plan."
            media={<Icon name="user" />}
            disabled
          />
        </RadioGroup>
      </ExampleCell>
      <ExampleCell align="stretch" label="Title only, nothing chosen yet">
        <RadioGroup
          aria-label="Token expiry"
          value={expiry}
          onValueChange={setExpiry}
          className="grid-cols-3"
        >
          <RadioGroupCard value="7d" title="7 days" />
          <RadioGroupCard value="30d" title="30 days" />
          <RadioGroupCard value="never" title="Never" />
        </RadioGroup>
      </ExampleCell>
    </ExampleGrid>
  );
}
