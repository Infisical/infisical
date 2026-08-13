import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ChevronRightIcon, TerminalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch
} from "@app/components/v3";
import {
  EndpointCommandStatus,
  TEndpointCommand,
  useCancelEndpointCommand,
  useExecuteEndpointCommand,
  useListEndpointCommands
} from "@app/hooks/api/endpoint";

const COMMAND_LIMIT = 25;

const TIMEOUT_OPTIONS = [
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "1 minute" },
  { value: "300", label: "5 minutes" }
];

const STATUS_VARIANT: Record<
  EndpointCommandStatus,
  "success" | "danger" | "warning" | "info" | "neutral"
> = {
  [EndpointCommandStatus.Pending]: "info",
  [EndpointCommandStatus.Dispatched]: "info",
  [EndpointCommandStatus.Succeeded]: "success",
  [EndpointCommandStatus.Failed]: "danger",
  [EndpointCommandStatus.Errored]: "danger",
  [EndpointCommandStatus.TimedOut]: "warning",
  [EndpointCommandStatus.Canceled]: "neutral",
  [EndpointCommandStatus.Expired]: "neutral"
};

const STATUS_LABEL: Record<EndpointCommandStatus, string> = {
  [EndpointCommandStatus.Pending]: "Queued",
  [EndpointCommandStatus.Dispatched]: "Running",
  [EndpointCommandStatus.Succeeded]: "Succeeded",
  [EndpointCommandStatus.Failed]: "Failed",
  [EndpointCommandStatus.Errored]: "Could not run",
  [EndpointCommandStatus.TimedOut]: "Timed out",
  [EndpointCommandStatus.Canceled]: "Canceled",
  [EndpointCommandStatus.Expired]: "Expired"
};

// The whole command as it was queued, which is what someone reading the log needs to see — not the
// program with its arguments dropped.
const formatInvocation = (command: TEndpointCommand) =>
  command.shell ? command.command : [command.command, ...command.args].join(" ");

const CommandRow = ({ command }: { command: TEndpointCommand }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const cancelCommand = useCancelEndpointCommand();

  const hasOutput = Boolean(command.stdout || command.stderr || command.error);

  const onCancel = async () => {
    try {
      await cancelCommand.mutateAsync({ commandId: command.id });
      createNotification({ text: "Command canceled.", type: "success" });
    } catch {
      // The mutation cache reports the server's message; a second toast here would duplicate it.
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={isExpanded ? "Hide output" : "Show output"}
          className="mt-0.5 text-muted hover:text-foreground disabled:opacity-40"
          disabled={!hasOutput}
          onClick={() => setIsExpanded((open) => !open)}
        >
          {isExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-foreground">{formatInvocation(command)}</p>
          <p className="mt-1 text-xs text-muted">
            {command.requestedByEmail ?? "a deleted user"} &middot;{" "}
            {formatDistanceToNow(new Date(command.createdAt), { addSuffix: true })}
            {command.shell && " · shell"}
            {command.exitCode !== null && ` · exit ${command.exitCode}`}
          </p>
          {command.reason && <p className="mt-1 text-xs text-muted italic">{command.reason}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_VARIANT[command.status]}>{STATUS_LABEL[command.status]}</Badge>
          {command.status === EndpointCommandStatus.Pending && (
            <Button
              size="xs"
              variant="outline"
              isPending={cancelCommand.isPending}
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {isExpanded && hasOutput && (
        <div className="space-y-3 bg-mineshaft-800/40 px-4 pb-4">
          {command.error && (
            <div>
              <p className="mb-1 text-xs font-medium text-danger">Could not run</p>
              <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-danger">
                {command.error}
              </pre>
            </div>
          )}
          {command.stdout && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">stdout</p>
              <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-foreground">
                {command.stdout}
              </pre>
            </div>
          )}
          {command.stderr && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">stderr</p>
              <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-foreground">
                {command.stderr}
              </pre>
            </div>
          )}
          {command.outputTruncated && (
            <p className="text-xs text-warning">
              Output was longer than the device keeps and has been cut off.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

type Props = {
  deviceId: string;
};

export const CommandConsoleCard = ({ deviceId }: Props) => {
  const [command, setCommand] = useState("");
  const [reason, setReason] = useState("");
  const [shell, setShell] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState("30");

  const executeCommand = useExecuteEndpointCommand();
  const { data, isPending } = useListEndpointCommands({ deviceId, limit: COMMAND_LIMIT });

  const commands = data?.commands ?? [];
  const trimmed = command.trim();

  const onRun = async () => {
    try {
      // Split off the arguments here so the agent execs an argv and never a command line. Naive on
      // whitespace by design: anything needing quoting is what the shell toggle is for.
      const [program, ...args] = trimmed.split(/\s+/);

      await executeCommand.mutateAsync({
        deviceId,
        command: shell ? trimmed : program,
        args: shell ? [] : args,
        shell,
        timeoutSeconds: Number(timeoutSeconds),
        reason: reason.trim() || undefined
      });

      setCommand("");
      setReason("");
      createNotification({ text: "Command queued for the device.", type: "success" });
    } catch {
      // Reported globally by the mutation cache.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Run a Command</CardTitle>
          <CardDescription>
            Runs on the device as root, the next time its agent checks in. A queued command that the
            device has not picked up within 15 minutes expires instead of running.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="command-input">Command</FieldLabel>
            <FieldContent>
              <Input
                id="command-input"
                className="font-mono"
                placeholder={shell ? "ps aux | grep ssh" : "e.g. /usr/bin/sw_vers"}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
              <FieldDescription>
                {shell
                  ? "Run through /bin/sh, so pipes, globs and redirection work."
                  : "Run directly. The words after the program become its arguments, split on spaces — turn on shell mode for anything needing quoting."}
              </FieldDescription>
            </FieldContent>
          </Field>

          <div className="flex flex-wrap items-end gap-4">
            <Field className="flex-1">
              <FieldLabel htmlFor="command-reason">Reason (optional)</FieldLabel>
              <FieldContent>
                <Input
                  id="command-reason"
                  placeholder="Why this is being run"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </FieldContent>
            </Field>

            <Field className="w-40">
              <FieldLabel>Timeout</FieldLabel>
              <FieldContent>
                <Select value={timeoutSeconds} onValueChange={setTimeoutSeconds}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {TIMEOUT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground" htmlFor="shell-mode">
              <Switch id="shell-mode" checked={shell} onCheckedChange={setShell} />
              Shell mode
            </label>

            <Button
              isDisabled={!trimmed}
              isPending={executeCommand.isPending}
              onClick={onRun}
            >
              Run Command
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Command History</CardTitle>
          <CardDescription>
            Every command run on this device, who ran it, and what came back.
          </CardDescription>
        </CardHeader>

        {isPending && (
          <CardContent>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          </CardContent>
        )}

        {!isPending && commands.length === 0 && (
          <CardContent>
            <Empty className="border">
              <EmptyMedia variant="icon">
                <TerminalIcon />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Nothing has been run</EmptyTitle>
                <EmptyDescription>
                  Commands run on this device appear here with their output, kept after the fact.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        )}

        {!isPending && commands.length > 0 && (
          <div>
            {commands.map((entry) => (
              <CommandRow key={entry.id} command={entry} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
