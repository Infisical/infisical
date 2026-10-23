import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverlayLayerContext, useOverlayLayer } from "./overlay-layer";

const createLayers = () => {
  const layers: ReturnType<typeof useOverlayLayer>[] = [];
  const Probe = ({ children }: { children?: ReactNode }) => {
    const layer = useOverlayLayer(false);
    layers.push(layer);
    return createElement(OverlayLayerContext.Provider, { value: layer.contextValue }, children);
  };
  renderToString(createElement(Probe, null, createElement(Probe)));
  return layers;
};

const createLayerChain = (configs: { isPending: boolean; isModal: boolean }[]) => {
  const values: ReturnType<typeof useOverlayLayer>["contextValue"][] = [];
  const Probe = ({ index }: { index: number }): ReactNode => {
    const layer = useOverlayLayer(configs[index].isPending, configs[index].isModal);
    values.push(layer.contextValue);
    return createElement(
      OverlayLayerContext.Provider,
      { value: layer.contextValue },
      index + 1 < configs.length ? createElement(Probe, { index: index + 1 }) : null
    );
  };
  renderToString(createElement(Probe, { index: 0 }));
  return values.map(({ isModal, isPending }) => ({ isModal, isPending }));
};

const escape = () =>
  Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" }) as KeyboardEvent;

beforeEach(() => vi.stubGlobal("KeyboardEvent", Event));
afterEach(() => vi.unstubAllGlobals());

describe("overlay popup bookkeeping", () => {
  it.each([false, true])("consumes ancestor-first Escape once with cancellation %s", (cancel) => {
    const [ancestor, child] = createLayers();
    const parentHandler = vi.fn();
    const onOpenChange = vi.fn();
    const onEscape = vi.fn((event: KeyboardEvent) => {
      if (cancel) event.preventDefault();
      else {
        onOpenChange(false);
        child.contextValue.registerPopup("choice", false);
      }
    });
    child.contextValue.registerPopup("choice", true, onEscape);
    const event = escape();
    ancestor.guardDismiss(event, parentHandler);
    child.guardDismiss(event, parentHandler);
    ancestor.guardDismiss(event, parentHandler);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onOpenChange.mock.calls).toEqual(cancel ? [] : [[false]]);
    expect(parentHandler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps the original popup-first event consumed through ancestor cleanup", () => {
    const [ancestor, child] = createLayers();
    const delegate = vi.fn();
    const parentHandler = vi.fn();
    child.contextValue.registerPopup("choice", true, delegate);
    const event = escape();
    const wrapped = Object.assign(new Event("outside"), { detail: { originalEvent: event } });
    child.contextValue.markPopupDismissEvent(wrapped);
    child.contextValue.registerPopup("choice", false);
    child.guardDismiss(event, parentHandler);
    ancestor.guardDismiss(event, parentHandler);
    expect(delegate).not.toHaveBeenCalled();
    expect(parentHandler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("preserves insertion order and removes descendant registrations from ancestors", () => {
    const [ancestor, child] = createLayers();
    const first = vi.fn();
    const latest = vi.fn();
    const updated = vi.fn();
    child.contextValue.registerPopup("first", true, first);
    child.contextValue.registerPopup("latest", true, latest);
    child.contextValue.registerPopup("first", true, updated);
    ancestor.guardDismiss(escape());
    expect(latest).toHaveBeenCalledTimes(1);
    expect(updated).not.toHaveBeenCalled();
    child.contextValue.registerPopup("latest", false);
    ancestor.guardDismiss(escape());
    expect(updated).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    child.contextValue.registerPopup("first", false);
    const parentHandler = vi.fn();
    ancestor.guardDismiss(escape(), parentHandler);
    expect(parentHandler).toHaveBeenCalledTimes(1);
    child.contextValue.registerPopup("legacy", true);
    ancestor.guardDismiss(escape(), parentHandler);
    expect(parentHandler).toHaveBeenCalledTimes(1);
    child.contextValue.registerPopup("legacy", false);
    ancestor.guardDismiss(escape(), parentHandler);
    expect(parentHandler).toHaveBeenCalledTimes(2);
  });
});

describe("overlay layer context inheritance", () => {
  it("keeps a standalone non-modal layer non-modal", () => {
    expect(createLayerChain([{ isPending: false, isModal: false }])).toEqual([
      { isModal: false, isPending: false }
    ]);
  });

  it("inherits modality and pending state into a non-modal layer", () => {
    expect(
      createLayerChain([
        { isPending: true, isModal: true },
        { isPending: false, isModal: false }
      ])
    ).toEqual([
      { isModal: true, isPending: true },
      { isModal: true, isPending: true }
    ]);
  });

  it("keeps a nested modal layer's own pending state", () => {
    expect(
      createLayerChain([
        { isPending: true, isModal: true },
        { isPending: false, isModal: true }
      ])
    ).toEqual([
      { isModal: true, isPending: true },
      { isModal: true, isPending: false }
    ]);
  });
});
