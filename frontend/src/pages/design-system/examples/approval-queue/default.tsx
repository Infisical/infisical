import { useState } from "react";

import { ApprovalQueue, type ApprovalRequest } from "@app/components/v4/patterns/approval-queue";

import { ExampleCell } from "../../example-presentation";

const initial: ApprovalRequest[] = [
  {
    id: "stripe",
    object: "stripe_api_key",
    title: (
      <>
        <code>stripe_api_key</code> change in production
      </>
    ),
    description: "Priya Raman asked to rotate the key before Friday's release.",
    age: "4m",
    href: "#approval-queue",
    state: "new"
  },
  {
    id: "db",
    object: "database_url",
    title: (
      <>
        <code>database_url</code> change in production
      </>
    ),
    description: "Marcus Okonkwo-Fitzgerald points it at the new replica.",
    age: "1h",
    href: "#approval-queue",
    state: "pending"
  },
  {
    id: "agent",
    object: "release-notes-agent",
    title: (
      <>
        <code>release-notes-agent</code> access approved
      </>
    ),
    description: "Read access to staging for 1 hour, approved by you.",
    age: "2h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "sync",
    object: "vercel-sync",
    title: (
      <>
        <code>vercel-sync</code> change in staging
      </>
    ),
    description: "Sarah Lin adds 3 secrets to the sync.",
    age: "3h",
    href: "#approval-queue",
    state: "failed",
    error: "Vercel rejected the token. Reconnect Vercel, then retry."
  }
];

export default function Example() {
  const [requests, setRequests] = useState(initial);
  const set = (id: string, patch: Partial<ApprovalRequest>) =>
    setRequests((value) =>
      value.map((request) => (request.id === id ? { ...request, ...patch } : request))
    );
  const approve = (id: string) => {
    set(id, { state: "pending" });
    window.setTimeout(() => {
      const object = initial.find((request) => request.id === id)?.object;
      set(id, {
        state: "resolved",
        title: (
          <>
            <code>{object}</code> change approved
          </>
        ),
        description: "Approved by you just now."
      });
    }, 1200);
  };
  return (
    <ExampleCell label="New, pending, resolved with undo, failed with retry" align="stretch">
      <ApprovalQueue
        requests={requests}
        current="db"
        historyHref="#approval-queue"
        onApprove={approve}
        onView={(id) => set(id, { state: "pending" })}
        onUndo={(id) =>
          set(id, {
            state: "new",
            description: "The approval was taken back. It is waiting on you again."
          })
        }
        onRetry={approve}
      />
    </ExampleCell>
  );
}
