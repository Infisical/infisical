import { useEffect, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Terminal, type TerminalHandle, type TerminalStatus } from "@infisical/cipher/ui/terminal";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Readline } from "xterm-readline";

import { PamAccountType, type TPamAccount } from "@app/hooks/api/pam";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { TWebAccessChannel } from "../../data/pam/web-access/contract";
import {
  accessErrorCode,
  MFA_FAILED,
  mfaSessionIdOf,
  WebAccessServerMessageSchema,
  WsMessageType
} from "./web-access";

const toCrlf = (text: string) => text.replace(/\r?\n/g, "\r\n");

export const TerminalSession = ({
  account,
  reason,
  mfaSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
}) => {
  const webAccess = useV4Adapter("pam").useWebAccess();
  const runMfa = useV4Adapter("pamAccess").useMfaChallenge();
  const isSSH = account.accountType === PamAccountType.SSH;
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [message, setMessage] = useState<string>();
  const handleRef = useRef<TerminalHandle>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const channelRef = useRef<TWebAccessChannel | null>(null);
  const readlineRef = useRef<Readline | null>(null);
  const readLoopRef = useRef(false);
  const nextPromptRef = useRef<{ resolve: (prompt: string) => void; reject: () => void } | null>(
    null
  );
  const promptRef = useRef<((input: string) => void) | null>(null);
  const inputRef = useRef("");
  const endReasonRef = useRef<string | undefined>(undefined);
  const reasonRef = useRef(reason);
  const mfaRef = useRef(mfaSessionId);

  const write = (text: string) => handleRef.current?.write(text);

  const fail = (text: string) => {
    setStatus("error");
    setMessage(text);
  };

  const prompt = (question: string) => {
    if (readlineRef.current) return readlineRef.current.read(question);
    write(question);
    return new Promise<string>((resolve) => {
      promptRef.current = resolve;
    });
  };

  const sendResize = () => {
    const terminal = xtermRef.current;
    if (!isSSH || !terminal || !channelRef.current?.isOpen()) return;
    channelRef.current.send(
      JSON.stringify({
        type: WsMessageType.Resize,
        data: JSON.stringify({ rows: terminal.rows, cols: terminal.cols })
      })
    );
  };

  const runReadLoop = async (readline: Readline, initialPrompt: string) => {
    readLoopRef.current = true;
    let current = initialPrompt;
    while (readLoopRef.current) {
      let line: string;
      try {
        // eslint-disable-next-line no-await-in-loop -- each line waits for the server's next prompt
        line = await readline.read(current);
      } catch {
        break;
      }
      if (!channelRef.current?.isOpen()) break;
      channelRef.current.send(JSON.stringify({ type: WsMessageType.Input, data: line }));
      try {
        // eslint-disable-next-line no-await-in-loop -- each line waits for the server's next prompt
        current = await new Promise<string>((resolve, reject) => {
          nextPromptRef.current = { resolve, reject };
        });
      } catch {
        break;
      }
    }
    readLoopRef.current = false;
  };

  const onMessage = (raw: string) => {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = WebAccessServerMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === WsMessageType.SessionEnd) {
      endReasonRef.current = event.reason;
      write(`\r\n${toCrlf(event.reason)}\r\n`);
      return;
    }
    const readline = readlineRef.current;
    if (event.type === WsMessageType.Ready) {
      setStatus("connected");
      sendResize();
      if (readline) {
        if (event.data) readline.print(toCrlf(event.data));
        runReadLoop(readline, event.prompt || "=> ");
      }
      return;
    }
    if (event.data) {
      if (isSSH) write(event.data);
      else readline?.print(toCrlf(event.data));
    }
    if (event.prompt && !isSSH && nextPromptRef.current) {
      const { resolve } = nextPromptRef.current;
      nextPromptRef.current = null;
      resolve(event.prompt);
    }
  };

  const onClose = () => {
    channelRef.current = null;
    readLoopRef.current = false;
    nextPromptRef.current?.reject();
    nextPromptRef.current = null;
    setStatus("disconnected");
    setMessage(endReasonRef.current);
  };

  const connect = async (): Promise<void> => {
    setStatus("connecting");
    setMessage(undefined);
    endReasonRef.current = undefined;
    try {
      const ticket = await webAccess.requestTicket({
        accountId: account.id,
        reason: reasonRef.current,
        mfaSessionId: mfaRef.current
      });
      mfaRef.current = undefined;
      handleRef.current?.reset();
      channelRef.current = webAccess.openTerminal({
        accountId: account.id,
        accountType: account.accountType,
        ticket,
        onMessage,
        onClose
      });
    } catch (error) {
      const challenge = mfaSessionIdOf(error);
      if (challenge) {
        const url = `${window.location.origin}/mfa-session/${challenge}`;
        write(
          `\r\nMFA verification required. Complete verification in the opened window or via this link:\r\n\r\n  ${url}\r\n\r\nWaiting for verification...\r\n`
        );
        const outcome = await runMfa(challenge);
        if (outcome !== "verified") {
          fail(MFA_FAILED[outcome]);
          return;
        }
        mfaRef.current = challenge;
        handleRef.current?.reset();
        await connect();
        return;
      }
      if (accessErrorCode(error) === "PAM_REASON_REQUIRED") {
        write("\r\nThis account requires a reason for access.\r\n");
        const answer = (await prompt("\r\nEnter reason: ")).trim();
        if (!answer) {
          write("\r\nA reason is required to continue.\r\n");
          await prompt("\r\nPress Enter to try again.");
        } else {
          reasonRef.current = answer;
        }
        handleRef.current?.reset();
        await connect();
        return;
      }
      fail(errorMessage(error) ?? "Failed to connect. Please try again.");
    }
  };

  const disconnect = () => {
    const channel = channelRef.current;
    if (!channel) return;
    if (channel.isOpen())
      channel.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
    channel.close();
  };

  const reconnect = () => {
    disconnect();
    handleRef.current?.reset();
    connect();
  };

  useEffect(
    () => () => {
      readLoopRef.current = false;
      const channel = channelRef.current;
      channelRef.current = null;
      channel?.close();
    },
    []
  );

  return (
    <Terminal
      ref={handleRef}
      label={account.name}
      status={status}
      message={message}
      onRetry={reconnect}
      options={{ allowProposedApi: true }}
      style={{ flex: 1, minHeight: 480 }}
      actions={
        status === "connected" && (
          <Button variant="ghost" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        )
      }
      onReady={(terminal) => {
        xtermRef.current = terminal;
        terminal.loadAddon(new WebLinksAddon());
        if (!isSSH) {
          const readline = new Readline();
          terminal.loadAddon(readline);
          readlineRef.current = readline;
          terminal.onKey(({ domEvent }) => {
            if (domEvent.ctrlKey && domEvent.key === "c" && channelRef.current?.isOpen())
              channelRef.current.send(
                JSON.stringify({ type: WsMessageType.Control, data: "clear-buffer" })
              );
          });
        }
        connect();
      }}
      onResize={sendResize}
      onData={(data) => {
        const answer = promptRef.current;
        if (answer) {
          if (data === "\r") {
            write("\r\n");
            promptRef.current = null;
            answer(inputRef.current);
            inputRef.current = "";
          } else if (data === "\u007f") {
            if (!inputRef.current) return;
            inputRef.current = inputRef.current.slice(0, -1);
            write("\b \b");
          } else {
            inputRef.current += data;
            write(data);
          }
          return;
        }
        if (isSSH && channelRef.current?.isOpen())
          channelRef.current.send(JSON.stringify({ type: WsMessageType.Input, data }));
      }}
    />
  );
};
