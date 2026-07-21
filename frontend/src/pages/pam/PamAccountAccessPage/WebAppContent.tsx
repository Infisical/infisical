import { useEffect, useRef, useState } from "react";

import { apiRequest } from "@app/config/request";
import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

// Renders a live web-app session: reassembles length-prefixed JPEG frames from the
// binary WebSocket stream and paints each onto a <canvas>.
export const WebAppContent = ({ account, reason, mfaSessionId }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "ended">("connecting");

  useEffect(() => {
    let cancelled = false;
    let buf = new Uint8Array(0);

    const draw = async (jpeg: Uint8Array) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const bitmap = await createImageBitmap(new Blob([jpeg], { type: "image/jpeg" }));
        if (cancelled) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
      } catch {
        // ignore an undecodable frame
      }
    };

    const onBinary = (data: ArrayBuffer) => {
      const incoming = new Uint8Array(data);
      const merged = new Uint8Array(buf.length + incoming.length);
      merged.set(buf, 0);
      merged.set(incoming, buf.length);
      buf = merged;

      // parse as many complete [4-byte length][jpeg] frames as we have
      for (;;) {
        if (buf.length < 4) break;
        const len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false);
        if (buf.length < 4 + len) break;
        void draw(buf.slice(4, 4 + len));
        buf = buf.slice(4 + len);
        setStatus("connected");
      }
    };

    const connect = async () => {
      try {
        const { data } = await apiRequest.post<{ ticket: string }>(
          `/api/v1/pam/accounts/${account.id}/web-access-ticket`,
          { reason, mfaSessionId }
        );
        if (cancelled) return;

        const { protocol, host } = window.location;
        const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${wsProtocol}//${host}/api/v1/pam/accounts/${account.id}/web-access?ticket=${encodeURIComponent(data.ticket)}`
        );
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) onBinary(event.data);
        };
        ws.onclose = () => {
          if (!cancelled) setStatus("ended");
        };
      } catch {
        if (!cancelled) setStatus("ended");
      }
    };

    void connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [account.id, reason, mfaSessionId]);

  return (
    <div className="flex h-screen w-screen flex-col bg-black">
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="max-h-full max-w-full" />
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-1.5 text-xs text-muted">
        <span
          className={`inline-block size-2 rounded-full ${
            status === "connected" ? "bg-success" : status === "ended" ? "bg-muted" : "bg-warning"
          }`}
        />
        <span>
          {status === "connected" ? "Connected" : status === "ended" ? "Disconnected" : "Connecting"}
        </span>
        <span className="ml-auto">{account.name}</span>
      </div>
    </div>
  );
};
