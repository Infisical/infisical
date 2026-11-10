import { Code } from "@app/components/v4/ui/code";
import * as UI from "@app/components/v4/ui/hover-card";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const widths = [
  {
    width: "default",
    trigger: "Staging connection",
    body: "Last synchronized 12 versions. All clients are up to date."
  },
  {
    width: "sm",
    trigger: "SAML provider",
    body: "Okta sends the email, first name and last name attributes. Members sign in through the Infisical app tile in Okta, and new members join with the Member role."
  },
  {
    width: "md",
    trigger: "Raw SCIM event",
    body: '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"active","value":false}]}'
  },
  { width: "content", trigger: "Tags", body: "env:production, team:payments" }
] as const;

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {widths.map(({ width, trigger, body }) => (
        <ExampleCell key={width} label={width}>
          <UI.HoverCard>
            <UI.HoverCardTrigger asChild>
              <a href="#hover-card" onClick={(event) => event.preventDefault()}>
                {trigger}
              </a>
            </UI.HoverCardTrigger>
            <UI.HoverCardContent width={width} align="start">
              {width === "md" ? (
                <Code block wrap language="json" label="Raw SCIM event">
                  {body}
                </Code>
              ) : (
                <p>{body}</p>
              )}
            </UI.HoverCardContent>
          </UI.HoverCard>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
