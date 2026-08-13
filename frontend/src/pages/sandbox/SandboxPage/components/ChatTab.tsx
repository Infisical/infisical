import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

import { SandboxChat } from "./SandboxChat";

/**
 * The chat gets no card. A conversation is the whole page here, and wrapping it in a titled panel
 * with its own border and description nested a scrolling column inside a box inside the page frame,
 * which is three sets of edges for one thing. It sits directly under the page header instead.
 */
export const ChatTab = ({ sandbox }: { sandbox: TSandbox }) => (
  <SandboxChat sandbox={sandbox} isRunning={sandbox.status === SandboxStatus.Running} />
);
