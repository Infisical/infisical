import {
  ActivityIcon,
  CpuIcon,
  MemoryStickIcon,
  NetworkIcon,
  ScanIcon,
  XCircleIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  SandboxStatus,
  TSandbox,
  useListSandboxProcesses,
  useTerminateSandboxProcess
} from "@app/hooks/api/sandboxes";

/**
 * What is running inside the container. The image has no `ps`, so this is read straight from /proc,
 * and the headline numbers come from the daemon rather than from inside the sandbox, which cannot
 * see its own limits.
 */

const formatMemory = (kb: number) => {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / 1024 / 1024).toFixed(2)} GB`;
};

/** A kernel thread, which `ps` also shows in brackets. Dimmed: it is never what you came looking for. */
const isThread = (command: string) => command.startsWith("[");

const Meter = ({
  icon: Icon,
  label,
  value,
  detail,
  percent,
  tone
}: {
  icon: typeof CpuIcon;
  label: string;
  value: string;
  detail?: string;
  percent?: number;
  tone: string;
}) => (
  <div className="flex-1 rounded-md border border-border bg-card p-3">
    <div className="flex items-center gap-2">
      <Icon className={`size-3.5 ${tone}`} />
      <span className="text-xs text-muted">{label}</span>
    </div>

    <p className="mt-1.5 font-mono text-lg tabular-nums text-foreground">{value}</p>
    {detail && <p className="font-mono text-[11px] text-muted">{detail}</p>}

    {percent !== undefined && (
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.replace("text-", "bg-")}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    )}
  </div>
);

export const ProcessMonitorTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;
  const { data } = useListSandboxProcesses(sandbox.id, isRunning);
  const terminate = useTerminateSandboxProcess();

  const handleTerminate = async (pid: number) => {
    await terminate.mutateAsync({ sandboxId: sandbox.id, pid });
    createNotification({ type: "success", text: `Terminated process ${pid}` });
  };

  const processes = data?.processes ?? [];
  const stats = data?.stats;
  // Bars are relative to the heaviest process, so the shape of the list is readable whatever the
  // absolute numbers are.
  const heaviest = processes[0]?.memoryKb || 1;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Process Monitor</CardTitle>
        <CardDescription>
          Everything running inside this sandbox, refreshed every few seconds.
        </CardDescription>
        <CardAction>
          <Badge variant={isRunning ? "success" : "neutral"}>
            {isRunning && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />
            )}
            {isRunning ? "Live" : "Not running"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        {!isRunning ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <ActivityIcon />
              </EmptyMedia>
              <EmptyTitle>Sandbox is stopped</EmptyTitle>
              <EmptyDescription>Start it to see what is running inside.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Meter
                icon={CpuIcon}
                label="CPU"
                value={`${(stats?.cpuPercent ?? 0).toFixed(1)}%`}
                detail={`${sandbox.vcpu} vCPU allocated`}
                percent={stats?.cpuPercent}
                tone="text-info"
              />
              <Meter
                icon={MemoryStickIcon}
                label="Memory"
                value={`${(stats?.memoryUsedMb ?? 0).toFixed(0)} MB`}
                detail={`of ${(stats?.memoryLimitMb ?? sandbox.memoryMb).toFixed(0)} MB`}
                percent={stats?.memoryPercent}
                tone="text-success"
              />
              <Meter
                icon={NetworkIcon}
                label="Network"
                value={stats?.networkIn ?? "0B"}
                detail={`${stats?.networkOut ?? "0B"} out`}
                tone="text-project"
              />
              <Meter
                icon={ScanIcon}
                label="Processes"
                value={String(stats?.processCount ?? processes.length)}
                detail={`${processes.filter((p) => !isThread(p.command)).length} not kernel threads`}
                tone="text-muted"
              />
            </div>

            <div className="thin-scrollbar max-h-[440px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">PID</TableHead>
                    <TableHead>Command</TableHead>
                    <TableHead className="w-52 text-right">Memory</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processes.map((process) => (
                    <TableRow key={process.pid}>
                      <TableCell className="py-2 font-mono text-xs text-muted tabular-nums">
                        {process.pid}
                      </TableCell>

                      <TableCell className="py-2">
                        <span
                          title={process.command}
                          className={`block truncate font-mono text-xs ${
                            isThread(process.command) ? "text-muted" : "text-foreground"
                          }`}
                        >
                          {process.command}
                        </span>
                      </TableCell>

                      <TableCell className="py-2">
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="h-1 w-20 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-info transition-all duration-500"
                              style={{ width: `${(process.memoryKb / heaviest) * 100}%` }}
                            />
                          </div>
                          <span className="w-16 text-right font-mono text-xs text-muted tabular-nums">
                            {formatMemory(process.memoryKb)}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        {/* PID 1 is the container's init: killing it stops the sandbox, so it is not
                            offered as a row action. */}
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={`Terminate process ${process.pid}`}
                          isDisabled={process.pid === 1 || terminate.isPending}
                          onClick={() => handleTerminate(process.pid)}
                        >
                          <XCircleIcon className="size-3.5 text-danger" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
