import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TSandbox, useLinkSandboxSlack } from "@app/hooks/api/sandboxes";

type Props = {
  sandbox: TSandbox;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const SlackConversationSheet = ({ sandbox, isOpen, onOpenChange }: Props) => {
  const linkSlack = useLinkSandboxSlack();

  const [channelId, setChannelId] = useState("");
  const [threadTs, setThreadTs] = useState("");

  // Reopening the sheet should show what is stored, not whatever was typed last time.
  useEffect(() => {
    if (isOpen) {
      setChannelId(sandbox.slackChannelId ?? "");
      setThreadTs(sandbox.slackThreadTs ?? "");
    }
  }, [isOpen, sandbox.slackChannelId, sandbox.slackThreadTs]);

  const isLinked = Boolean(sandbox.slackChannelId);

  const handleSave = async () => {
    await linkSlack.mutateAsync({
      sandboxId: sandbox.id,
      channelId: channelId.trim() || null,
      threadTs: threadTs.trim() || null
    });

    createNotification({
      type: "success",
      text: channelId.trim() ? "Slack conversation connected" : "Slack conversation disconnected"
    });
    onOpenChange(false);
  };

  const handleDisconnect = async () => {
    await linkSlack.mutateAsync({ sandboxId: sandbox.id, channelId: null, threadTs: null });
    createNotification({ type: "success", text: "Slack conversation disconnected" });
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Connect Slack Conversation</SheetTitle>
          <SheetDescription>
            Messages sent here are relayed into the sandbox, so the agent can be talked to from
            Slack rather than only posting to it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          <Field>
            <FieldLabel htmlFor="slack-channel">Channel ID</FieldLabel>
            <Input
              id="slack-channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="C0123456789"
              className="font-mono text-xs"
            />
            <FieldDescription>
              In Slack, open the channel, choose View channel details, and copy the ID at the
              bottom.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="slack-thread">Thread (optional)</FieldLabel>
            <Input
              id="slack-thread"
              value={threadTs}
              onChange={(e) => setThreadTs(e.target.value)}
              placeholder="1712345678.000100"
              className="font-mono text-xs"
              disabled={!channelId.trim()}
            />
            <FieldDescription>
              Leave blank to listen to the whole channel. Set it to keep one channel serving several
              sandboxes, one per thread.
            </FieldDescription>
          </Field>

          <div className="rounded-md border border-border bg-card p-3 text-xs text-muted">
            <p className="text-foreground">How it works</p>
            <p className="mt-1">
              Mention the bot in the channel. The message is appended to{" "}
              <span className="font-mono">/workspace/.slack/inbox.jsonl</span> inside the sandbox,
              and the agent replies through the Slack integration.
            </p>
            <p className="mt-1">Requires the Slack integration to be added first.</p>
          </div>
        </div>

        <SheetFooter className="justify-end border-t">
          {isLinked && (
            <Button
              variant="ghost"
              onClick={handleDisconnect}
              isPending={linkSlack.isPending}
              className="mr-auto text-danger"
            >
              Disconnect
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            onClick={handleSave}
            isDisabled={!channelId.trim()}
            isPending={linkSlack.isPending}
          >
            {isLinked ? "Update" : "Connect"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
