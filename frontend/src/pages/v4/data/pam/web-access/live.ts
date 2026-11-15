import type { UserInteraction } from "@devolutions/iron-remote-desktop";

import { apiRequest } from "@app/config/request";
import { useAccessPamAccount } from "@app/hooks/api/pam";

import type { PamWebAccessAdapter, TWebAccessTransport } from "./contract";

// The gateway acceptor's NLA exchange expects these fixed credentials
const BROWSER_ACCEPTOR_USERNAME = "infisical";
const BROWSER_ACCEPTOR_PASSWORD = "infisical";
// Must match the backend connector_config defaults
const DESKTOP_SIZE = { width: 1920, height: 1080 };
const RDP_SESSION_FAILED = "Unable to establish the remote session.";
const WASM_DATA_URI = "data:application/wasm;base64,";

const webAccessUrl = (accountId: string, ticket: string) => {
  const { protocol, host } = window.location;
  return `${protocol === "https:" ? "wss:" : "ws:"}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
};

type TRdpBackend = (typeof import("@devolutions/iron-remote-desktop-rdp"))["Backend"];
let rdpBackend: Promise<TRdpBackend> | null = null;

// IronRDP fetch()es its WASM from a data: URI, which CSP would have to allow in connect-src. Serving it as a blob response only needs "blob:".
const loadRdpBackend = () => {
  if (!rdpBackend) {
    rdpBackend = (async () => {
      const [rdp] = await Promise.all([
        import("@devolutions/iron-remote-desktop-rdp"),
        import("@devolutions/iron-remote-desktop")
      ]);
      const originalFetch = window.fetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        let url: string;
        if (typeof input === "string") url = input;
        else if (input instanceof URL) url = input.href;
        else url = input.url;
        if (!url.startsWith(WASM_DATA_URI)) return originalFetch(input, init);
        window.fetch = originalFetch;
        const bytes = Uint8Array.from(atob(url.slice(WASM_DATA_URI.length)), (char) =>
          char.charCodeAt(0)
        );
        return new Response(bytes, {
          headers: { "Content-Type": "application/wasm" }
        });
      };
      try {
        await rdp.init("INFO");
      } finally {
        window.fetch = originalFetch;
      }
      return rdp.Backend;
    })().catch((error) => {
      rdpBackend = null;
      throw error;
    });
  }
  return rdpBackend;
};

// The client sizes its fit scaling from window.innerWidth and innerHeight, so point them at the frame it draws into
const fitWindowTo = (container: HTMLElement) => {
  const descriptors = (["innerWidth", "innerHeight"] as const).map(
    (key) =>
      [
        key,
        Object.getOwnPropertyDescriptor(window, key) ??
          Object.getOwnPropertyDescriptor(Window.prototype, key)
      ] as const
  );
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => container.getBoundingClientRect().right
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => container.getBoundingClientRect().bottom
  });
  return () =>
    descriptors.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(window, key, descriptor);
    });
};

const transport: TWebAccessTransport = {
  requestTicket: async ({ accountId, reason, mfaSessionId, selectedHost }) => {
    const { data } = await apiRequest.post<{ ticket: string }>(
      `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
      { reason, mfaSessionId, selectedHost }
    );
    return data.ticket;
  },
  openTerminal: ({ accountId, ticket, onMessage, onClose }) => {
    const socket = new WebSocket(webAccessUrl(accountId, ticket));
    socket.onmessage = (event) => onMessage(String(event.data));
    socket.onclose = onClose;
    return {
      send: (message) => socket.send(message),
      close: () => socket.close(),
      isOpen: () => socket.readyState === WebSocket.OPEN
    };
  },
  connectRemoteDesktop: async ({ container, accountId, ticket, destination }) => {
    const Backend = await loadRdpBackend();
    const element = document.createElement("iron-remote-desktop");
    (element as unknown as { module: TRdpBackend }).module = Backend;
    element.setAttribute("scale", "fit");
    element.setAttribute("flexcenter", "true");
    element.style.width = "100%";
    element.style.height = "100%";
    const restoreWindow = fitWindowTo(container);
    let ui: UserInteraction | undefined;
    const shutdown = () => {
      try {
        ui?.shutdown();
      } catch {
        // shutdown throws when the connection never finished opening
      }
      element.remove();
      restoreWindow();
    };
    try {
      const { ended } = await new Promise<{ ended: Promise<void> }>((resolve, reject) => {
        element.addEventListener(
          "ready",
          (event) => {
            ui = (event as CustomEvent<{ irgUserInteraction: UserInteraction }>).detail
              .irgUserInteraction;
            ui.setEnableClipboard(false);
            const config = ui
              .configBuilder()
              .withUsername(BROWSER_ACCEPTOR_USERNAME)
              .withPassword(BROWSER_ACCEPTOR_PASSWORD)
              .withDestination(destination)
              .withProxyAddress(webAccessUrl(accountId, ticket))
              .withAuthToken("infisical")
              .withDesktopSize(DESKTOP_SIZE)
              .build();
            ui.connect(config).then((session) => {
              ui?.setVisibility(true);
              resolve({ ended: session.run().then(() => undefined) });
            }, reject);
          },
          { once: true }
        );
        container.appendChild(element);
      });
      return { ended, shutdown };
    } catch (error) {
      console.error("RDP session failed:", error);
      shutdown();
      throw new Error(RDP_SESSION_FAILED);
    }
  }
};

export const pamWebAccessLive: PamWebAccessAdapter = {
  useWebAccess: () => transport,
  useAccessAccount: useAccessPamAccount
};
