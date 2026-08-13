import { TerminalIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

import { TSandboxBoot } from "./SandboxBootConsole";
import { SandboxFileBrowser } from "./SandboxFileBrowser";
import { SandboxTerminal } from "./SandboxTerminal";

export const TerminalTab = ({
  sandbox,
  boot,
  onBootSettled
}: {
  sandbox: TSandbox;
  boot: TSandboxBoot | null;
  onBootSettled: () => void;
}) => (
  <Card className="min-w-0">
    <CardHeader>
      <CardTitle>Terminal</CardTitle>
      <CardDescription>
        A shell inside the sandbox. No credentials are present in this environment.
      </CardDescription>
      <CardAction>
        <div className="flex size-9 items-center justify-center rounded-md border border-neutral/15 bg-neutral/10 text-neutral [&>svg]:size-5">
          <TerminalIcon />
        </div>
      </CardAction>
    </CardHeader>
    <CardContent>
      {/* Files left, shell right. min-w-0 on both, or the terminal canvas widens its own column. */}
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SandboxFileBrowser
          sandboxId={sandbox.id}
          isRunning={sandbox.status === SandboxStatus.Running}
        />
        <SandboxTerminal
          sandboxId={sandbox.id}
          sandboxName={sandbox.name}
          isRunning={sandbox.status === SandboxStatus.Running}
          boot={boot}
          onBootSettled={onBootSettled}
          sandbox={sandbox}
        />
      </div>
    </CardContent>
  </Card>
);
