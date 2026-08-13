import { MessageSquareIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

import { SandboxChat } from "./SandboxChat";

export const ChatTab = ({ sandbox }: { sandbox: TSandbox }) => (
  <Card className="min-w-0">
    <CardHeader>
      <CardTitle>Agent</CardTitle>
      <CardDescription>
        Talk to the agent. It can use every CLI and database granted to this sandbox.
      </CardDescription>
      <CardAction>
        <div className="flex size-9 items-center justify-center rounded-md border border-info/15 bg-info/10 text-info [&>svg]:size-5">
          <MessageSquareIcon />
        </div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <SandboxChat sandbox={sandbox} isRunning={sandbox.status === SandboxStatus.Running} />
    </CardContent>
  </Card>
);
