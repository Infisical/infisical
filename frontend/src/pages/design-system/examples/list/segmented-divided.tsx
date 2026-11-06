import { Button } from "@app/components/v4/ui/button";
import { Media } from "@app/components/v4/ui/item";
import { List, ListFooter, ListHeader, ListRow, ListSection } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const header = (
  <ListHeader
    title="What's new"
    count="2 unread"
    action={
      <Button variant="link" size="sm" asChild>
        <a href="#list">View all</a>
      </Button>
    }
  />
);

const sections = (variant: string) => [
  <ListSection key="week" label="This week">
    <ListRow
      value={`${variant}-gateway-pools`}
      label="Gateway pools"
      title="Gateway pools"
      description="Route PAM sessions through any healthy gateway in a pool."
      media={<Media icon="globe" />}
      meta="Nov 5"
      href="#list"
      unread
    />
    <ListRow
      value={`${variant}-rotation`}
      label="Scheduled rotation for Postgres"
      title="Scheduled rotation for Postgres"
      description="Rotate database credentials on a schedule you set per environment."
      media={<Media icon="key" />}
      meta="Nov 4"
      href="#list"
      unread
    />
  </ListSection>,
  <ListSection key="earlier" label="Earlier">
    <ListRow
      value={`${variant}-audit-streams`}
      label="Audit log streams to Datadog"
      title="Audit log streams to Datadog"
      description="Send every audit event to Datadog as it happens."
      media={<Media icon="sync" />}
      meta="Oct 28"
      href="#list"
    />
    <ListRow
      value={`${variant}-sso`}
      label="SSO enforcement for sub-organizations"
      title="SSO enforcement for sub-organizations"
      description="Require SSO in every sub-organization from the parent's settings."
      media={<Media icon="lock" />}
      meta="Oct 21"
      href="#list"
      resolved
    />
  </ListSection>
];

const footer = (
  <ListFooter>
    <Button variant="link" size="sm" asChild>
      <a href="#list">Release notes</a>
    </Button>
  </ListFooter>
);

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="segmented">
        <List label="What's new" variant="segmented">
          {header}
          {sections("segmented")}
          {footer}
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="divided">
        <List label="What's new" variant="divided">
          {header}
          {sections("divided")}
          {footer}
        </List>
      </ExampleCell>
    </ExampleGrid>
  );
}
