import { useCallback, useEffect, useRef, useState } from "react";

import { buildQueryMessage, buildStartupMessage, parseMessages, type PgMessage } from "./pg-wire";
import { useWebSocket } from "./useWebSocket";

type PgStatus = "connecting" | "authenticating" | "ready" | "disconnected" | "error";

type UsePgProtocolOptions = {
  relayHost: string | undefined;
  relayClientCertificate: string | undefined;
  sharedSecret: string | undefined;
  sessionId: string | undefined;
  resourceType: string | undefined;
};

type OutputLine = {
  text: string;
  kind: "info" | "error" | "data" | "status";
};

const formatRow = (values: (string | null)[], widths: number[]): string =>
  values.map((v, i) => (v ?? "NULL").padEnd(widths[i])).join(" | ");

const formatSeparator = (widths: number[]): string => widths.map((w) => "-".repeat(w)).join("-+-");

export const usePgProtocol = ({
  relayHost,
  relayClientCertificate,
  sharedSecret,
  sessionId,
  resourceType
}: UsePgProtocolOptions) => {
  const { status: wsStatus, messages: rawMessages, send: wsSend, reconnect } = useWebSocket({
    relayHost,
    relayClientCertificate,
    sharedSecret,
    sessionId,
    resourceType
  });

  const [pgStatus, setPgStatus] = useState<PgStatus>("disconnected");
  const [output, setOutput] = useState<OutputLine[]>([]);
  const pgBufferRef = useRef<Uint8Array>(new Uint8Array(0));
  const startupSentRef = useRef(false);
  const lastProcessedRef = useRef(0);
  const currentFieldsRef = useRef<string[]>([]);
  const currentRowsRef = useRef<(string | null)[][]>([]);

  const appendOutput = useCallback((lines: OutputLine[]) => {
    setOutput((prev) => [...prev, ...lines]);
  }, []);

  const flushTable = useCallback(() => {
    const fields = currentFieldsRef.current;
    const rows = currentRowsRef.current;
    if (fields.length === 0 && rows.length === 0) {
      return;
    }

    const widths = fields.map((f, i) =>
      Math.max(f.length, ...rows.map((r) => (r[i] ?? "NULL").length))
    );

    const lines: OutputLine[] = [];
    if (fields.length > 0) {
      lines.push({ text: formatRow(fields, widths), kind: "data" });
      lines.push({ text: formatSeparator(widths), kind: "data" });
    }
    for (const row of rows) {
      lines.push({ text: formatRow(row, widths), kind: "data" });
    }
    appendOutput(lines);

    currentFieldsRef.current = [];
    currentRowsRef.current = [];
  }, [appendOutput]);

  const handlePgMessage = useCallback(
    (msg: PgMessage) => {
      switch (msg.type) {
        case "auth_ok":
          appendOutput([{ text: "Authenticated.", kind: "status" }]);
          break;
        case "auth_request":
          appendOutput([{ text: `Unexpected auth request (method ${msg.method})`, kind: "error" }]);
          break;
        case "ready":
          flushTable();
          setPgStatus("ready");
          break;
        case "row_description":
          currentFieldsRef.current = msg.fields;
          currentRowsRef.current = [];
          break;
        case "data_row":
          currentRowsRef.current.push(msg.values);
          break;
        case "command_complete":
          flushTable();
          appendOutput([{ text: msg.tag, kind: "status" }]);
          break;
        case "error":
          flushTable();
          appendOutput([
            {
              text: `ERROR: ${msg.message}${msg.detail ? `\nDETAIL: ${msg.detail}` : ""}`,
              kind: "error"
            }
          ]);
          break;
        case "notice":
          appendOutput([{ text: `NOTICE: ${msg.message}`, kind: "info" }]);
          break;
        case "param_status":
        case "backend_key":
        case "empty_query":
          break;
        case "unknown":
          console.log("[pg] unknown message code:", msg.code);
          break;
        default:
          break;
      }
    },
    [appendOutput, flushTable]
  );

  // Send startup message when WebSocket becomes connected
  useEffect(() => {
    if (wsStatus === "connected" && !startupSentRef.current) {
      startupSentRef.current = true;
      setPgStatus("authenticating");
      appendOutput([{ text: "Sending startup...", kind: "status" }]);
      // Add creds so that we can get the protocol flow started. These dont really matter. 
      wsSend(buildStartupMessage("web", "default"));
    }
    if (wsStatus === "disconnected" || wsStatus === "error") {
      setPgStatus(wsStatus === "error" ? "error" : "disconnected");
      startupSentRef.current = false;
      lastProcessedRef.current = 0;
    }
  }, [wsStatus, wsSend, appendOutput]);

  // Process incoming raw messages through PG protocol parser
  useEffect(() => {
    if (rawMessages.length <= lastProcessedRef.current) {
      return;
    }

    const newMessages = rawMessages.slice(lastProcessedRef.current);
    lastProcessedRef.current = rawMessages.length;

    let buf = pgBufferRef.current;
    for (const raw of newMessages) {
      const combined = new Uint8Array(buf.length + raw.length);
      combined.set(buf, 0);
      combined.set(raw, buf.length);
      buf = combined;
    }

    const { messages: pgMessages, remaining } = parseMessages(buf);
    pgBufferRef.current = remaining;

    for (const msg of pgMessages) {
      handlePgMessage(msg);
    }
  }, [rawMessages, handlePgMessage]);

  const sendQuery = useCallback(
    (sql: string) => {
      appendOutput([{ text: `> ${sql}`, kind: "info" }]);
      wsSend(buildQueryMessage(sql));
    },
    [wsSend, appendOutput]
  );

  const handleReconnect = useCallback(() => {
    setOutput([]);
    setPgStatus("disconnected");
    startupSentRef.current = false;
    lastProcessedRef.current = 0;
    pgBufferRef.current = new Uint8Array(0);
    currentFieldsRef.current = [];
    currentRowsRef.current = [];
    reconnect();
  }, [reconnect]);

  return { pgStatus, output, sendQuery, reconnect: handleReconnect };
};
