import { useState } from "react";

import { Announcements } from "@app/components/v4/ui/announcements";
import { Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Snippet } from "@app/components/v4/ui/snippet";

import { ExampleCell } from "../../example-presentation";

const items = [
  {
    id: "share",
    eyebrow: "Secrets, Sep 24",
    title: "Share a secret with a link that expires",
    description: "Send a one-time link instead of pasting values into chat.",
    media: (
      <List label="Shared secrets" title="Shared links">
        <ListRow
          value="one"
          label="stripe_api_key"
          title="stripe_api_key"
          meta="Expires in 1 hour"
        />
        <ListRow value="two" label="database_url" title="database_url" meta="Viewed" />
      </List>
    ),
    action: { label: "Share a secret", onClick: () => undefined }
  },
  {
    id: "cli",
    eyebrow: "CLI, Sep 18",
    title: "Run any command with your secrets injected",
    description: "The CLI now reads the environment from your project's default.",
    media: <Snippet label="Run command" value="infisical run -- npm start" />
  },
  {
    id: "approvals",
    eyebrow: "Approvals, Sep 10",
    title: "Approve changes to production from the sidebar",
    description: "Requests waiting on you now show as a count beside Approvals.",
    action: { label: "Read the docs", href: "#announcements", external: true }
  }
];

export default function Example() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(items.map((item) => item.id));
  return (
    <ExampleCell label="Opened from a What's new button with its unseen count">
      <Button variant="outline" icon="megaphone" onClick={() => setOpen(true)}>
        What&apos;s new
        {unseen.length > 0 && <Count>{unseen.length}</Count>}
      </Button>
      <Announcements
        items={items}
        open={open}
        onOpenChange={setOpen}
        onSeen={(id) => setUnseen((current) => current.filter((entry) => entry !== id))}
      />
    </ExampleCell>
  );
}
