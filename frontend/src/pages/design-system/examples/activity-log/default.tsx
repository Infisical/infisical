import { useState } from "react";

import { type ActivityDay, ActivityLog } from "@app/components/v4/patterns/activity-log";

import { ExampleCell } from "../../example-presentation";

const firstPage: ActivityDay[] = [
  {
    label: "Today",
    events: [
      {
        id: "1",
        actor: "Sarah Lin",
        summary: (
          <>
            Sarah Lin updated <code>stripe_api_key</code>
          </>
        ),
        time: "10:42"
      },
      {
        id: "2",
        actor: "github-deployer",
        actorKind: "machine",
        summary: (
          <>
            <code>github-deployer</code> read 14 secrets in production
          </>
        ),
        time: "10:31"
      },
      {
        id: "3",
        actor: "release-notes-agent",
        actorKind: "agent",
        summary: (
          <>
            <code>release-notes-agent</code> requested read access to staging
          </>
        ),
        time: "09:58"
      }
    ]
  },
  {
    label: "Yesterday",
    events: [
      {
        id: "4",
        actor: "Marcus Okonkwo-Fitzgerald",
        summary: "Marcus Okonkwo-Fitzgerald approved a change to production",
        time: "17:20"
      }
    ]
  }
];
const olderDay: ActivityDay = {
  label: "Oct 15",
  events: [
    {
      id: "5",
      actor: "Priya Raman",
      summary: (
        <>
          Priya Raman created <code>sentry_dsn</code>
        </>
      ),
      time: "14:05"
    },
    {
      id: "6",
      actor: "Sarah Lin",
      summary: "Sarah Lin invited Priya Raman",
      time: "13:50"
    }
  ]
};

export default function Example() {
  const [days, setDays] = useState(firstPage);
  const [loading, setLoading] = useState(false);
  return (
    <ExampleCell label="Grouped by day, load more" align="stretch">
      <ActivityLog
        days={days}
        total={6}
        loading={loading}
        onLoadMore={() => {
          setLoading(true);
          window.setTimeout(() => {
            setDays([...firstPage, olderDay]);
            setLoading(false);
          }, 1200);
        }}
      />
    </ExampleCell>
  );
}
