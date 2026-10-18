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

const diffs: Record<string, string> = {
  stripe: "- stripe_api_key = sk_live_...4f2a\n+ stripe_api_key = sk_live_...9c1e",
  db: "- database_url = postgres://primary.internal/payments\n+ database_url = postgres://replica-2.internal/payments",
  sync: "+ SENTRY_DSN\n+ REDIS_URL\n+ FEATURE_FLAGS_KEY"
};

export default function Example() {
  const [requests, setRequests] = useState(initial);
  const [viewing, setViewing] = useState<string>();
  const replace = (id: string, next: ApprovalRequest) =>
    setRequests((value) => value.map((request) => (request.id === id ? next : request)));
  const original = (id: string) => initial.find((request) => request.id === id);
  const approve = (id: string) => {
    const base = original(id);
    if (!base) return;
    replace(id, { ...base, state: "pending", error: undefined });
    window.setTimeout(
      () =>
        replace(id, {
          ...base,
          state: "resolved",
          error: undefined,
          title: (
            <>
              <code>{base.object}</code> change approved
            </>
          ),
          description: "Approved by you just now."
        }),
      1200
    );
  };
  return (
    <ExampleCell label="New, pending, resolved with undo, failed with retry" align="stretch">
      <ApprovalQueue
        requests={requests}
        current="db"
        historyHref="#approval-queue"
        onApprove={approve}
        onView={(id) => setViewing(id)}
        onUndo={(id) => {
          const base = original(id);
          if (!base) return;
          replace(id, {
            ...base,
            state: "new",
            error: undefined,
            title:
              base.state === "resolved" ? (
                <>
                  <code>{base.object}</code> access requested
                </>
              ) : (
                base.title
              ),
            description:
              base.state === "resolved"
                ? "Read access to staging for 1 hour. The approval was taken back."
                : base.description
          });
        }}
        onRetry={approve}
      />
      {viewing && diffs[viewing] && (
        <pre aria-label={`Diff for ${original(viewing)?.object}`}>{diffs[viewing]}</pre>
      )}
    </ExampleCell>
  );
}
