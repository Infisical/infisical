import type { Page } from "@playwright/test";

import type { RunEvents } from "./events.js";

/**
 * Live browser frames via the Chrome DevTools Protocol.
 *
 * Chosen over VNC or a headed-browser-in-a-container because it is about thirty lines and no
 * extra infrastructure: Chromium already encodes frames, and it only sends one when the page
 * actually changes, so an idle page costs nothing.
 *
 * Every frame must be acknowledged. Chromium stops sending until the outstanding frame is
 * acked, so a missed ack looks exactly like a frozen browser, which on a stage is
 * indistinguishable from a hung run.
 */

export type StopScreencast = () => Promise<void>;

export const startScreencast = async (
  page: Page,
  events: RunEvents,
  options: { quality?: number; maxWidth?: number; maxHeight?: number } = {}
): Promise<StopScreencast> => {
  let session;
  try {
    session = await page.context().newCDPSession(page);
  } catch {
    // CDP is Chromium-only. A run without live frames is still a valid run, so this degrades
    // rather than failing: the report and the trace still carry everything.
    events.log("live browser view unavailable (CDP session could not be opened)");
    return async () => {};
  }

  const cdp = session;

  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
    events.frame(frame.data);
    // Fire and forget: the page may already have navigated, which makes the ack fail
    // harmlessly, and awaiting it here would serialize frame delivery behind the run.
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: options.quality ?? 60,
    maxWidth: options.maxWidth ?? 1280,
    maxHeight: options.maxHeight ?? 800,
    everyNthFrame: 1
  });

  return async () => {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await cdp.detach().catch(() => {});
  };
};
