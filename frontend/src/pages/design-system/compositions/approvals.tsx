import { ApprovalQueue, type ApprovalRequest } from "@app/components/v4/patterns/approval-queue";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";

import { Shell, useCrumbs } from "./shared";

const requests: ApprovalRequest[] = [
  {
    id: "smtp",
    object: "SMTP_PASSWORD",
    title: (
      <>
        <code>SMTP_PASSWORD</code> delete in production
      </>
    ),
    description: "Priya Raman asked to delete 1 secret at /.",
    age: "1h",
    state: "new"
  },
  {
    id: "batch",
    object: "LOG_LEVEL",
    title: (
      <>
        <code>LOG_LEVEL</code> and <code>REDIS_URL</code> update in production
      </>
    ),
    description: "Diego Alvarez asked to update 2 secrets at /.",
    age: "4h",
    state: "new"
  },
  {
    id: "webhook",
    object: "STRIPE_WEBHOOK_SECRET",
    title: (
      <>
        <code>STRIPE_WEBHOOK_SECRET</code> add in production
      </>
    ),
    description: "Marcus Webb asked to add 1 secret at /.",
    age: "7h",
    state: "new"
  },
  {
    id: "stripe",
    object: "STRIPE_API_KEY",
    title: (
      <>
        <code>STRIPE_API_KEY</code> update in production
      </>
    ),
    description: "Tom Becker asked to update 1 secret at /.",
    age: "10h",
    state: "new"
  }
];
export default function Approvals() {
  const { org, product, project } = useCrumbs();
  return (
    <Shell
      level="project"
      current="approvals"
      crumbs={[org, product, project, { label: "Approvals" }]}
    >
      <Stack gap={24}>
        <PageHeader
          title="Approval workflows"
          description="Approval policies for any change to secrets in sensitive environments and folders."
          tabs={
            <Tabs
              label="Approval sections"
              defaultValue="changes"
              tabs={[
                { value: "changes", label: "Change requests", count: 4, content: null },
                { value: "access", label: "Access requests", content: null },
                { value: "policies", label: "Policies", count: 1, content: null }
              ]}
            />
          }
        />
        <ApprovalQueue
          requests={requests}
          onApprove={() => {}}
          onView={() => {}}
          onUndo={() => {}}
          onRetry={() => {}}
          historyHref="#"
        />
      </Stack>
    </Shell>
  );
}
