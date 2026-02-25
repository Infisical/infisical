import { useState } from "react";
import {
  AlertTriangleIcon,
  BellIcon,
  GaugeIcon,
  GlobeIcon,
  SaveIcon,
  SettingsIcon,
  ShieldCheckIcon,
  Trash2Icon
} from "lucide-react";

import {
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput,
  UnstableSeparator
} from "@app/components/v3";

export const SettingsTab = () => {
  const [projectName, setProjectName] = useState("Customer Support Network");
  const [projectDescription, setProjectDescription] = useState(
    "Multi-agent system for handling customer support tickets, escalations, and refunds."
  );
  const [environment, setEnvironment] = useState("staging");

  const [requireApproval, setRequireApproval] = useState(true);
  const [autoEscalate, setAutoEscalate] = useState(true);
  const [auditLogging, setAuditLogging] = useState(true);
  const [sandboxMode, setSandboxMode] = useState(false);

  const [slackNotifications, setSlackNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("https://hooks.example.com/arbiter/events");

  const [maxRequestsPerMin, setMaxRequestsPerMin] = useState("1000");
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState("50");
  const [burstLimit, setBurstLimit] = useState("200");

  return (
    <div className="flex flex-col gap-5">
      {/* General Settings */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            <SettingsIcon className="size-4" />
            General Settings
          </UnstableCardTitle>
          <UnstableCardDescription>
            Basic configuration for your agent network project.
          </UnstableCardDescription>
          <UnstableCardAction>
            <Button variant="project">
              <SaveIcon />
              Save Changes
            </Button>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <FieldGroup>
            <Field>
              <FieldTitle>Project Name</FieldTitle>
              <UnstableInput
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldTitle>Description</FieldTitle>
              <TextArea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <Field>
              <FieldTitle>Environment</FieldTitle>
              <FieldDescription>
                Select the environment this agent network is deployed to.
              </FieldDescription>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Governance Policies */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            <ShieldCheckIcon className="size-4" />
            Governance Policies
          </UnstableCardTitle>
          <UnstableCardDescription>
            Control how agents are governed and what actions require oversight.
          </UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Require Human Approval for High-Risk Actions
                <FieldDescription>
                  Agents must wait for human review before executing actions classified as
                  high-risk.
                </FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={requireApproval}
                onCheckedChange={setRequireApproval}
              />
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Auto-Escalate Failed Checks
                <FieldDescription>
                  Automatically route requests to the escalation agent when governance checks fail.
                </FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={autoEscalate}
                onCheckedChange={setAutoEscalate}
              />
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Enable Audit Logging
                <Badge variant="success" className="ml-2">
                  Recommended
                </Badge>
                <FieldDescription>
                  Record all agent decisions and governance outcomes for compliance and debugging.
                </FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={auditLogging}
                onCheckedChange={setAuditLogging}
              />
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Sandbox Mode
                <Badge variant="warning" className="ml-2">
                  Testing Only
                </Badge>
                <FieldDescription>
                  Run all agent actions in a sandboxed environment without side effects.
                </FieldDescription>
              </FieldTitle>
              <Switch
                variant="warning"
                checked={sandboxMode}
                onCheckedChange={setSandboxMode}
              />
            </Field>
          </FieldGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Notification Preferences */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            <BellIcon className="size-4" />
            Notification Preferences
          </UnstableCardTitle>
          <UnstableCardDescription>
            Configure how you receive alerts about agent activity and governance events.
          </UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Slack Notifications
                <FieldDescription>
                  Send alerts to your connected Slack workspace.
                </FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={slackNotifications}
                onCheckedChange={setSlackNotifications}
              />
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Email Notifications
                <FieldDescription>Receive email digests for governance decisions.</FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Webhook
                <FieldDescription>Forward events to an external endpoint.</FieldDescription>
              </FieldTitle>
              <Switch
                variant="project"
                checked={webhookEnabled}
                onCheckedChange={setWebhookEnabled}
              />
            </Field>
            {webhookEnabled && (
              <Field>
                <FieldTitle>Webhook URL</FieldTitle>
                <UnstableInput
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://..."
                />
              </Field>
            )}
          </FieldGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Rate Limiting */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            <GaugeIcon className="size-4" />
            Rate Limiting
          </UnstableCardTitle>
          <UnstableCardDescription>
            Set limits on agent request throughput to prevent abuse and control costs.
          </UnstableCardDescription>
          <UnstableCardAction>
            <Button variant="project">
              <SaveIcon />
              Save Limits
            </Button>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <FieldGroup>
            <Field>
              <FieldTitle>Max Requests Per Minute</FieldTitle>
              <FieldDescription>
                Maximum number of agent requests allowed per minute across all agents.
              </FieldDescription>
              <UnstableInput
                type="number"
                value={maxRequestsPerMin}
                onChange={(e) => setMaxRequestsPerMin(e.target.value)}
              />
            </Field>
            <Field>
              <FieldTitle>Max Concurrent Sessions</FieldTitle>
              <FieldDescription>
                Maximum number of active agent sessions running simultaneously.
              </FieldDescription>
              <UnstableInput
                type="number"
                value={maxConcurrentSessions}
                onChange={(e) => setMaxConcurrentSessions(e.target.value)}
              />
            </Field>
            <Field>
              <FieldTitle>Burst Limit</FieldTitle>
              <FieldDescription>
                Allow temporary spikes up to this number of requests before throttling.
              </FieldDescription>
              <UnstableInput
                type="number"
                value={burstLimit}
                onChange={(e) => setBurstLimit(e.target.value)}
              />
            </Field>
          </FieldGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Danger Zone */}
      <UnstableCard className="border-danger/30">
        <UnstableCardHeader>
          <UnstableCardTitle className="text-danger">
            <AlertTriangleIcon className="size-4" />
            Danger Zone
          </UnstableCardTitle>
          <UnstableCardDescription>
            Irreversible actions that affect your entire agent network.
          </UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Reset Project Data
                <FieldDescription>
                  Clear all session history, audit logs, and cached agent state. Agent configurations
                  will be preserved.
                </FieldDescription>
              </FieldTitle>
              <Button variant="outline" size="sm">
                <GlobeIcon />
                Reset Data
              </Button>
            </Field>
            <UnstableSeparator />
            <Field orientation="horizontal">
              <FieldTitle className="flex-1">
                Delete Project
                <FieldDescription>
                  Permanently delete this agent network and all associated data. This action cannot
                  be undone.
                </FieldDescription>
              </FieldTitle>
              <Button variant="danger" size="sm">
                <Trash2Icon />
                Delete Project
              </Button>
            </Field>
          </FieldGroup>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
