import { ReactNode } from "react";
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
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  SandboxStatus,
  TSandbox,
  useGetSandboxMetrics,
  useListSandboxProcesses,
  useTerminateSandboxProcess
} from "@app/hooks/api/sandboxes";

import { CountUp, Sparkline } from "../../components/charts";

/** One card per number, with the series behind it where there is one worth showing. */
const MetricPanel = ({
  icon: Icon,
  label,
  value,
  detail,
  children
}: {
  icon: typeof CpuIcon;
  label: string;
  value: ReactNode;
  detail: string;
  children?: ReactNode;
}) => (
  <div className="rounded-md border border-border bg-card p-3">
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 text-muted" />
      <span className="text-xs text-muted">{label}</span>
    </div>

    <p className="mt-1.5 font-mono text-lg text-foreground tabular-nums">{value}</p>
    <p className="font-mono text-[11px] text-muted">{detail}</p>

    {children && <div className="mt-2">{children}</div>}
  </div>
);

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

export const ProcessMonitorTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;
  const { data } = useListSandboxProcesses(sandbox.id, isRunning);
  // Metrics come from the sampler, which polls continuously and keeps history, rather than from a
  // snapshot taken per request.
  const { data: metrics } = useGetSandboxMetrics(sandbox.id, isRunning);

  // The sampler keeps a rolling history, so the meters can show shape rather than just a number.
  const cpuSeries = metrics?.samples.map((sample) => sample.cpuPercent) ?? [];
  const memorySeries = metrics?.samples.map((sample) => sample.memoryMb) ?? [];
  const memoryLimit = metrics?.memoryLimitMb || sandbox.memoryMb;
  const terminate = useTerminateSandboxProcess();

  const handleTerminate = async (pid: number) => {
    await terminate.mutateAsync({ sandboxId: sandbox.id, pid });
    createNotification({ type: "success", text: `Terminated process ${pid}` });
  };

  const processes = data?.processes ?? [];
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricPanel
                icon={CpuIcon}
                label="CPU"
                value={
                  <>
                    <CountUp value={metrics?.cpuPercent ?? 0} decimals={1} />%
                  </>
                }
                detail={`${sandbox.vcpu} vCPU allocated`}
              >
                <Sparkline values={cpuSeries} max={100} gradientId="monitor-cpu" isEmphasised />
              </MetricPanel>

              <MetricPanel
                icon={MemoryStickIcon}
                label="Memory"
                value={
                  <>
                    <CountUp value={metrics?.memoryMb ?? 0} decimals={1} /> MB
                  </>
                }
                detail={`of ${Math.round(memoryLimit)} MB`}
              >
                <Sparkline
                  values={memorySeries}
                  max={memoryLimit}
                  gradientId="monitor-memory"
                  isEmphasised
                />
              </MetricPanel>

              <MetricPanel
                icon={NetworkIcon}
                label="Network"
                value={
                  <>
                    <CountUp value={metrics?.networkInKb ?? 0} /> KB
                  </>
                }
                detail={`${Math.round(metrics?.networkOutKb ?? 0)} KB out`}
              />

              <MetricPanel
                icon={ScanIcon}
                label="Processes"
                // Counted from the same list the table renders. The daemon's PID figure counts
                // differently, so showing it here made the card contradict the rows beneath it.
                value={<CountUp value={processes.length} />}
                detail={`${
                  processes.filter((process) => isThread(process.command)).length
                } kernel threads`}
              />
            </div>

            <div className="max-h-[440px] thin-scrollbar overflow-y-auto">
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
                              // Floored at 10%: the track is 80px wide, so the previous 3% floor was
                              // itself the couple of pixels it was meant to avoid, and rounded-full
                              // then drew it as a dot.
                              style={{
                                width: `${Math.max((process.memoryKb / heaviest) * 100, 10)}%`
                              }}
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
                        {/* Tooltipped: an unlabelled red icon beside a process list is a
                            destructive action with no indication of what it will destroy. */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label={`Terminate process ${process.pid}`}
                              isDisabled={process.pid === 1 || terminate.isPending}
                              onClick={() => handleTerminate(process.pid)}
                            >
                              <XCircleIcon className="size-3.5 text-danger" />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>
                            {process.pid === 1
                              ? "PID 1 is the container's init and cannot be terminated"
                              : `Terminate PID ${process.pid} — ${process.command.slice(0, 60)}`}
                          </TooltipContent>
                        </Tooltip>
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
