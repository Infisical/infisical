import { Browser, chromium, Page } from "playwright";

import { logger } from "@app/lib/logger";

import { parseClientMessage } from "../pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "../pam-web-access-types";
import { packFrame, WebPageClientMessageSchema } from "./pam-webpage-frame-codec";

const CHUNK_INTERVAL_MS = 2000;
const WS_HIGH_WATER_MARK = 1024 * 1024; // mirror RDP
const MAX_FPS = 10;

// CDP screencast frame event. CDPSession `.on` payloads are loosely typed, so we type the fields we read.
type TScreencastFrameEvent = {
  data: string;
  sessionId: number;
  metadata: { deviceWidth?: number; deviceHeight?: number; timestamp?: number };
};

export const handleWebPageSession = async (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, sendMessage, sendSessionEnd, onCleanup, recording } = ctx;
  const details = params.connectionDetails as { startPath?: string };
  const startPath = details.startPath ?? "/";
  const startedAt = Date.now();

  let browser: Browser | null = null;
  let page: Page | null = null;
  let cleanedUp = false;

  // recording buffer
  let chunkIndex = 0;
  let frameBuf: Array<{ type: "web_frame"; elapsedMs: number; jpegBase64: string; w: number; h: number }> = [];
  let chunkStartMs = 0;
  let lastFrameSent = 0;

  const flushChunk = async () => {
    if (!recording || frameBuf.length === 0) return;
    const events = frameBuf;
    const start = chunkStartMs;
    const end = events[events.length - 1].elapsedMs;
    frameBuf = [];
    chunkStartMs = end;
    const idx = chunkIndex;
    chunkIndex += 1;
    try {
      await recording.recordChunk({
        chunkIndex: idx,
        startElapsedMs: start,
        endElapsedMs: end,
        plaintext: Buffer.from(JSON.stringify(events))
      });
    } catch (err) {
      logger.error({ sessionId, err }, `webpage session: chunk write failed [sessionId=${sessionId}]`);
    }
  };

  const teardown = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      await flushChunk();
    } catch {
      /* best effort */
    }
    try {
      await browser?.close();
    } catch (err) {
      logger.debug(err, "webpage session: browser close error");
    }
  };

  try {
    // The browser resolves every hostname to 127.0.0.1:<relayPort> via --host-resolver-rules, so all
    // traffic is tunnelled to the single target host:port behind the relay. This is the single
    // cooperative-target simplification: the Host header (and thus the `http://internal` hostname
    // below) is irrelevant because the relay ignores it and there is exactly one target. A multi-
    // target / vhost / TLS setup would need per-request host routing, which this does not attempt.
    browser = await chromium.launch({
      args: ["--headless=new", "--no-sandbox", `--host-resolver-rules=MAP * 127.0.0.1:${relayPort}`],
      headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();

    const onFrame = (frame: { data: string; width?: number; height?: number }) => {
      const elapsedMs = Date.now() - startedAt;
      const jpeg = Buffer.from(frame.data, "base64");
      const w = frame.width ?? 1280;
      const h = frame.height ?? 720;

      // record
      if (recording) {
        if (frameBuf.length === 0) chunkStartMs = elapsedMs;
        frameBuf.push({ type: "web_frame", elapsedMs, jpegBase64: jpeg.toString("base64"), w, h });
        if (elapsedMs - chunkStartMs >= CHUNK_INTERVAL_MS) void flushChunk();
      }

      // live stream (drop frames on backpressure / FPS cap)
      const now = Date.now();
      if (now - lastFrameSent < 1000 / MAX_FPS) return;
      if (socket.bufferedAmount > WS_HIGH_WATER_MARK) return;
      lastFrameSent = now;
      try {
        socket.send(packFrame({ ts: elapsedMs, w, h, jpeg }), { binary: true });
      } catch (err) {
        logger.debug(err, "webpage session: frame send error");
      }
    };

    // Playwright 1.61 has no high-level screencast API, so we drive it over CDP.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 720 });
    cdp.on("Page.screencastFrame", (evt: TScreencastFrameEvent) => {
      onFrame({ data: evt.data, width: evt.metadata.deviceWidth, height: evt.metadata.deviceHeight });
      // Every frame MUST be acked or CDP stalls the stream. Guard the ack — the session may have closed.
      void (async () => {
        try {
          await cdp.send("Page.screencastFrameAck", { sessionId: evt.sessionId });
        } catch {
          /* session closed */
        }
      })();
    });

    await page.goto(`http://internal${startPath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    sendMessage({ type: TerminalServerMessageType.Ready, data: "" });

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      if (cleanedUp || !page) return;
      const msg = parseClientMessage(raw, WebPageClientMessageSchema);
      if (!msg) return;
      void (async () => {
        try {
          if (msg.type === "mouse") {
            if (msg.action === "move") await page.mouse.move(msg.x, msg.y);
            else if (msg.action === "down") await page.mouse.down({ button: msg.button });
            else if (msg.action === "up") await page.mouse.up({ button: msg.button });
            else await page.mouse.click(msg.x, msg.y, { button: msg.button });
          } else if (msg.type === "key") {
            if (msg.action === "down") await page.keyboard.down(msg.key);
            else await page.keyboard.up(msg.key);
          } else if (msg.type === "scroll") {
            await page.mouse.wheel(msg.dx, msg.dy);
          } else if (msg.type === "resize") {
            await page.setViewportSize({ width: msg.w, height: msg.h });
          } else if (msg.type === "navigate") {
            // gate: only same-origin relative paths for the demo
            if (msg.url.startsWith("/"))
              await page.goto(`http://internal${msg.url}`, { waitUntil: "domcontentloaded" });
          }
        } catch (err) {
          logger.debug({ sessionId, err }, "webpage session: input apply error");
        }
      })();
    });

    socket.on("close", () => {
      if (!cleanedUp) onCleanup();
      void teardown();
    });

    return { cleanup: teardown };
  } catch (err) {
    logger.error({ sessionId, err }, `webpage session: setup failed [sessionId=${sessionId}]`);
    sendSessionEnd(SessionEndReason.SetupFailed);
    await teardown();
    return { cleanup: teardown };
  }
};
