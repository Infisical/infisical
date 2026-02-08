import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";

import { useProject } from "@app/context";
import { type TWebAccessResponse, useAccessPamAccount } from "@app/hooks/api/pam";

import { usePgProtocol } from "./usePgProtocol";

const STATUS_COLOR: Record<string, string> = {
  connecting: "text-yellow-400",
  authenticating: "text-yellow-400",
  ready: "text-green-400",
  disconnected: "text-gray-400",
  error: "text-red-400"
};

const LINE_COLOR: Record<string, string> = {
  info: "text-blue-300",
  error: "text-red-400",
  data: "text-gray-200",
  status: "text-gray-500"
};

type Props = {
  accountId: string;
  accountPath: string;
};

const SESSION_DURATION = "4h";

const isWebSession = (data: unknown): data is TWebAccessResponse =>
  !!data && typeof data === "object" && "sharedSecret" in data;

export const PamTerminalPage = ({ accountId, accountPath }: Props) => {
  const { currentProject } = useProject();
  const { mutate, data, isPending, isError, error } = useAccessPamAccount();
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  const session = isWebSession(data) ? data : undefined;

  useEffect(() => {
    mutate({
      accountId,
      accountPath,
      projectId: currentProject.id,
      duration: SESSION_DURATION,
      clientType: "web"
    });
  }, [accountId, accountPath, currentProject.id]);

  const { pgStatus, output, sendQuery, reconnect } = usePgProtocol({
    relayHost: session?.relayHost,
    relayClientCertificate: session?.relayClientCertificate,
    sharedSecret: session?.sharedSecret,
    sessionId: session?.sessionId,
    resourceType: session?.resourceType
  });

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [output]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendQuery(trimmed);
    setInput("");
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <Helmet>
          <title>PAM Terminal</title>
        </Helmet>
        <p className="font-mono text-sm">Creating session...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        <Helmet>
          <title>PAM Terminal</title>
        </Helmet>
        <p className="font-mono text-sm">Failed to create session: {error?.message ?? "Unknown error"}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <Helmet>
          <title>PAM Terminal</title>
        </Helmet>
        <p className="font-mono text-sm">No web session data returned.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-white">
      <Helmet>
        <title>PAM Terminal</title>
      </Helmet>

      <div className="mb-2 flex items-center gap-2 font-mono text-sm">
        <span className={STATUS_COLOR[pgStatus] ?? "text-gray-400"}>{pgStatus}</span>
        {(pgStatus === "disconnected" || pgStatus === "error") && (
          <button
            type="button"
            onClick={reconnect}
            className="rounded border border-mineshaft-600 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-mineshaft-600"
          >
            Reconnect
          </button>
        )}
        <span className="text-gray-500">|</span>
        <span className="text-gray-500">session: {session.sessionId}</span>
      </div>

      <pre
        ref={logRef}
        className="flex-1 overflow-auto rounded border border-mineshaft-600 bg-bunker-900 p-3 font-mono text-sm"
      >
        {output.length === 0 ? (
          <span className="text-gray-600">Connecting...</span>
        ) : (
          output.map((line, i) => (
            <div key={`line-${i.toString()}`} className={LINE_COLOR[line.kind] ?? "text-gray-300"}>
              {line.text}
            </div>
          ))
        )}
      </pre>

      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="SELECT 1;"
          disabled={pgStatus !== "ready"}
          className="flex-1 rounded border border-mineshaft-600 bg-bunker-900 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={pgStatus !== "ready"}
          className="rounded bg-primary-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run
        </button>
      </div>
    </div>
  );
};
