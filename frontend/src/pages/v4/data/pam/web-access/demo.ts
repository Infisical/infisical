import { PamAccountType } from "@app/hooks/api/pam";

import { fixtureMutation } from "../../fixture-store";
import type { PamWebAccessAdapter, TWebAccessTransport } from "./contract";
import {
  DemoSqlError,
  demoSchemas,
  demoTableDetail,
  demoTables,
  runDemoQuery
} from "./demo-data-explorer";
import { paintDemoDesktop } from "./demo-desktop";

const SHELL_PROMPT = "\u001b[32mdeploy@bastion-ops\u001b[0m:\u001b[34m~\u001b[0m$ ";

const SHELL_OUTPUT: Record<string, string> = {
  whoami: "deploy",
  uptime: " 14:02:11 up 41 days,  3:17,  1 user,  load average: 0.08, 0.12, 0.09",
  ls: "deploy.sh  logs  releases  shared",
  "df -h": [
    "Filesystem      Size  Used Avail Use% Mounted on",
    "/dev/nvme0n1p1   97G   41G   56G  43% /",
    "/dev/nvme1n1    492G  318G  174G  65% /var/lib/data"
  ].join("\r\n")
};

const QUERY_OUTPUT: Record<string, string> = {
  PING: "PONG",
  DBSIZE: "(integer) 18342",
  "INFO keyspace": "# Keyspace\ndb0:keys=18342,expires=17904,avg_ttl=86011422",
  "GET session:9f2c": '"{\\"userId\\":\\"u_8812\\",\\"exp\\":1763200000}"'
};

const MOTD = [
  "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-1015-aws x86_64)",
  "",
  "  System load:  0.08              Processes:             142",
  "  Usage of /:   43.1% of 96.73GB  Users logged in:       0",
  "",
  "This session is recorded by Infisical.",
  ""
].join("\r\n");

const later = (run: () => void, ms = 350) => window.setTimeout(run, ms);

const openShell: TWebAccessTransport["openTerminal"] = ({ onMessage, onClose }) => {
  let open = true;
  let line = "";
  const output = (data: string) => onMessage(JSON.stringify({ type: "output", data, prompt: "" }));
  later(() => {
    onMessage(JSON.stringify({ type: "ready", data: "", prompt: "" }));
    output(`${MOTD}\r\n${SHELL_PROMPT}`);
  });
  const close = () => {
    if (!open) return;
    open = false;
    later(onClose, 0);
  };
  return {
    isOpen: () => open,
    close,
    send: (raw) => {
      const message = JSON.parse(raw) as { type: string; data: string };
      if (message.type === "control" && message.data === "quit") {
        close();
        return;
      }
      if (message.type !== "input") return;
      if (message.data === "\r") {
        const command = line.trim();
        line = "";
        if (command === "exit") {
          output("\r\nlogout\r\n");
          onMessage(
            JSON.stringify({
              type: "session_end",
              reason: "Session ended by the user."
            })
          );
          close();
          return;
        }
        const result = command
          ? (SHELL_OUTPUT[command] ?? `${command.split(" ")[0]}: command not found`)
          : "";
        output(`\r\n${result ? `${result}\r\n` : ""}${SHELL_PROMPT}`);
        return;
      }
      if (message.data === "\u007f") {
        if (!line) return;
        line = line.slice(0, -1);
        output("\b \b");
        return;
      }
      line += message.data;
      output(message.data);
    }
  };
};

const openQueryShell: TWebAccessTransport["openTerminal"] = ({ onMessage, onClose }) => {
  let open = true;
  const prompt = "sessions-cache> ";
  later(() =>
    onMessage(
      JSON.stringify({
        type: "ready",
        data: "Connected to sessions-cache (Redis 7.2.4)",
        prompt
      })
    )
  );
  const close = () => {
    if (!open) return;
    open = false;
    later(onClose, 0);
  };
  return {
    isOpen: () => open,
    close,
    send: (raw) => {
      const message = JSON.parse(raw) as { type: string; data: string };
      if (message.type === "control" && message.data === "quit") close();
      if (message.type !== "input") return;
      const command = message.data.trim();
      const data = command
        ? `${QUERY_OUTPUT[command] ?? `(error) ERR unknown command '${command}'`}\n`
        : "";
      later(() => onMessage(JSON.stringify({ type: "output", data, prompt })), 120);
    }
  };
};

const openDataExplorer: TWebAccessTransport["openDataExplorer"] = ({ onMessage, onClose }) => {
  let open = true;
  let nextConnection = 1;
  const transactions = new Map<string, boolean>();
  const reply = (message: Record<string, unknown>, ms = 140) =>
    later(() => {
      if (open) onMessage(JSON.stringify(message));
    }, ms);
  later(() => onMessage(JSON.stringify({ type: "ready" })), 600);
  const close = () => {
    if (!open) return;
    open = false;
    later(onClose, 0);
  };
  return {
    isOpen: () => open,
    close,
    send: (raw) => {
      const message = JSON.parse(raw) as {
        type: string;
        id?: string;
        connectionId?: string;
        schema?: string;
        table?: string;
        sql?: string;
      };
      const { id, connectionId = "" } = message;
      try {
        if (message.type === "open-connection") {
          const opened = `demo-connection-${nextConnection}`;
          nextConnection += 1;
          transactions.set(opened, false);
          reply({ type: "connection-opened", id, connectionId: opened, nativeConnectionId: null });
        } else if (message.type === "close-connection") transactions.delete(connectionId);
        else if (message.type === "get-schemas")
          reply({ type: "schemas", id, data: demoSchemas() });
        else if (message.type === "get-tables")
          reply({ type: "tables", id, data: demoTables(message.schema ?? "") });
        else if (message.type === "get-table-detail")
          reply({
            type: "table-detail",
            id,
            connectionId,
            transactionOpen: transactions.get(connectionId) ?? false,
            data: demoTableDetail(message.schema ?? "", message.table ?? "")
          });
        else if (message.type === "query") {
          const startedAt = performance.now();
          const result = runDemoQuery(message.sql ?? "", transactions.get(connectionId) ?? false);
          transactions.set(connectionId, result.transactionOpen);
          reply(
            {
              type: "query-result",
              id,
              connectionId,
              ...result,
              executionTimeMs: Math.max(1, Math.round(performance.now() - startedAt)) + 11
            },
            260
          );
        }
      } catch (error) {
        reply({
          type: "error",
          id,
          connectionId,
          transactionOpen: transactions.get(connectionId) ?? false,
          error: error instanceof Error ? error.message : "Query failed",
          detail: error instanceof DemoSqlError ? error.detail : undefined,
          hint: error instanceof DemoSqlError ? error.hint : undefined
        });
      }
    }
  };
};

const transport: TWebAccessTransport = {
  requestTicket: () =>
    new Promise((resolve) => {
      later(() => resolve("demo-web-access-ticket"));
    }),
  openTerminal: (input) =>
    input.accountType === PamAccountType.SSH ? openShell(input) : openQueryShell(input),
  openDataExplorer,
  connectRemoteDesktop: ({ container, signal }) =>
    new Promise((resolve, reject) => {
      const timer = later(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1080;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        const context = canvas.getContext("2d");
        if (context) paintDemoDesktop(context);
        container.appendChild(canvas);
        let end = () => {};
        resolve({
          ended: new Promise<void>((settle) => {
            end = settle;
          }),
          shutdown: () => {
            canvas.remove();
            end();
          }
        });
      }, 900);
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true }
      );
    })
};

export const pamWebAccessDemo: PamWebAccessAdapter = {
  useWebAccess: () => transport,
  useAccessAccount: fixtureMutation(() => ({
    sessionId: "demo-aws-console-session",
    accountType: PamAccountType.AwsIam,
    metadata: { consoleUrl: "https://console.aws.amazon.com/console/home" }
  }))
};
