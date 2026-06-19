import { useCallback, useEffect, useRef, useState } from "react";
import type { UserInteraction } from "@devolutions/iron-remote-desktop";
import { Backend, init as initRdpBackend } from "@devolutions/iron-remote-desktop-rdp";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import "@devolutions/iron-remote-desktop";

// Fixed credentials expected by the gateway acceptor's NLA exchange
const BROWSER_ACCEPTOR_USERNAME = "infisical";
const BROWSER_ACCEPTOR_PASSWORD = "infisical";

// Must match backend connector_config defaults
const DEFAULT_DESKTOP_SIZE = { width: 1920, height: 1080 };

const STATUS_BAR_HEIGHT = 33;

// WASM reads window.innerHeight for fit scaling, not the container
const innerHeightDescriptor =
  Object.getOwnPropertyDescriptor(window, "innerHeight") ??
  Object.getOwnPropertyDescriptor(Window.prototype, "innerHeight");
let innerHeightOverrideCount = 0;

function applyInnerHeightOverride() {
  if (innerHeightOverrideCount === 0 && innerHeightDescriptor?.get) {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get() {
        return (innerHeightDescriptor.get!.call(window) as number) - STATUS_BAR_HEIGHT;
      }
    });
  }
  innerHeightOverrideCount += 1;
}

function removeInnerHeightOverride() {
  innerHeightOverrideCount -= 1;
  if (innerHeightOverrideCount === 0 && innerHeightDescriptor) {
    Object.defineProperty(window, "innerHeight", innerHeightDescriptor);
  }
}

// IronRDP embeds WASM as a data: URI and fetch()es it at init, which
// requires "data:" in connect-src CSP. We briefly patch fetch to convert
// the data: URI into a blob response so only "blob:" is needed instead.
let rdpBackendInitialized: Promise<void> | null = null;
const ensureRdpBackend = () => {
  if (!rdpBackendInitialized) {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url: string;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else url = input.url;
      if (url.startsWith("data:application/wasm;base64,")) {
        window.fetch = originalFetch;
        const raw = atob(url.slice("data:application/wasm;base64,".length));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        return new Response(bytes, { headers: { "Content-Type": "application/wasm" } });
      }
      return originalFetch(input, init);
    };
    rdpBackendInitialized = initRdpBackend("INFO")
      .catch((e) => {
        rdpBackendInitialized = null;
        throw e;
      })
      .finally(() => {
        window.fetch = originalFetch;
      });
  }
  return rdpBackendInitialized;
};

type UseRdpSessionOptions = {
  accountId: string;
  accountName: string;
  reason?: string;
  onSessionEnd?: () => void;
};

export const useRdpSession = ({
  accountId,
  accountName,
  reason,
  onSessionEnd
}: UseRdpSessionOptions) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const userInteractionRef = useRef<UserInteraction | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const buildProxyAddress = useCallback(
    (ticket: string) => {
      const { protocol, host } = window.location;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
    },
    [accountId]
  );

  const teardown = useCallback(() => {
    try {
      userInteractionRef.current?.shutdown();
    } catch {
      // can throw if called before connect resolves
    }
    userInteractionRef.current = null;
    if (elementRef.current && elementRef.current.parentElement) {
      elementRef.current.parentElement.removeChild(elementRef.current);
    }
    elementRef.current = null;
    setIsConnected(false);
  }, []);

  const generationRef = useRef(0);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;
    teardown();
    setError(null);
    generationRef.current += 1;
    const gen = generationRef.current;
    const isCurrent = () => gen === generationRef.current;

    await ensureRdpBackend();
    if (!isCurrent()) return;

    const { data } = await apiRequest.post<{ ticket: string }>(
      `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
      { reason }
    );
    if (!isCurrent()) return;
    const proxyAddress = buildProxyAddress(data.ticket);

    const el = document.createElement("iron-remote-desktop");
    (el as unknown as { module: typeof Backend }).module = Backend;
    el.setAttribute("scale", "fit");
    el.setAttribute("flexcenter", "true");

    el.style.width = "100%";
    el.style.height = "100%";

    el.addEventListener("ready", (event) => {
      if (!isCurrent()) return;
      const ui = (event as CustomEvent<{ irgUserInteraction: UserInteraction }>).detail
        .irgUserInteraction;
      userInteractionRef.current = ui;
      ui.setEnableClipboard(false);

      const config = ui
        .configBuilder()
        .withUsername(BROWSER_ACCEPTOR_USERNAME)
        .withPassword(BROWSER_ACCEPTOR_PASSWORD)
        .withDestination(accountName)
        .withProxyAddress(proxyAddress)
        .withAuthToken("infisical")
        .withDesktopSize(DEFAULT_DESKTOP_SIZE)
        .build();

      ui.connect(config)
        .then(async (sessionInfo) => {
          if (!isCurrent()) return;
          setIsConnected(true);
          ui.setVisibility(true);
          await sessionInfo.run();
        })
        .catch((err) => {
          const ironErr = err as {
            backtrace?: () => string;
            kind?: () => unknown;
          };
          const kind = ironErr.kind?.();
          // eslint-disable-next-line no-console
          console.error("RDP session failed:", kind, ironErr.backtrace?.() ?? err);
          if (!isCurrent()) return;
          const detail = typeof kind === "string" ? kind : String(err);
          setError(detail);
          createNotification({
            type: "error",
            text: `RDP connection failed: ${detail}`
          });
        })
        .finally(() => {
          if (!isCurrent()) return;
          setIsConnected(false);
          onSessionEndRef.current?.();
        });
    });

    containerRef.current.appendChild(el);
    elementRef.current = el;
  }, [accountId, accountName, reason, buildProxyAddress, teardown]);

  const handleConnectError = useCallback((err: unknown) => {
    let message = "Failed to start RDP session";
    if (axios.isAxiosError(err)) {
      const apiMessage = (err.response?.data as { message?: string } | undefined)?.message;
      if (apiMessage) message = apiMessage;
    } else if (err instanceof Error && err.message) {
      message = err.message;
    }
    setError(message);
    createNotification({ type: "error", text: message });
    setIsConnected(false);
    onSessionEndRef.current?.();
  }, []);

  useEffect(() => {
    applyInnerHeightOverride();
    connect().catch(handleConnectError);
    return () => {
      generationRef.current += 1;
      teardown();
      removeInnerHeightOverride();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    onSessionEndRef.current?.();
  }, [teardown]);

  const reconnect = useCallback(() => {
    connect().catch(handleConnectError);
  }, [connect, handleConnectError]);

  return {
    containerRef,
    isConnected,
    error,
    disconnect,
    reconnect
  };
};
