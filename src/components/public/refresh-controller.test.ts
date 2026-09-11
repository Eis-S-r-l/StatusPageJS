import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicRefreshController, PUBLIC_REFRESH_MS, PUBLIC_REFRESH_TIMEOUT_MS } from "./refresh-controller";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const refresh = vi.fn();
  let visible = true;
  let online = true;
  const controller = new PublicRefreshController({ renderedAt: "initial", refresh, visible: () => visible, online: () => online });
  controller.start();
  return { controller, refresh, visible: (value: boolean) => { visible = value; }, online: (value: boolean) => { online = value; } };
}

describe("public status refresh", () => {
  it("polls visible pages and waits for a new server render before reporting success", () => {
    const { controller, refresh } = setup();
    vi.advanceTimersByTime(PUBLIC_REFRESH_MS);
    expect(refresh).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toBe("refreshing");
    controller.refresh();
    expect(refresh).toHaveBeenCalledOnce();
    controller.acknowledge("initial");
    expect(controller.getSnapshot()).toBe("refreshing");
    controller.acknowledge("new-render");
    expect(controller.getSnapshot()).toBe("current");
    controller.stop();
  });

  it("skips hidden tabs and refreshes when the visibility handler runs on return", () => {
    const state = setup();
    state.visible(false);
    vi.advanceTimersByTime(PUBLIC_REFRESH_MS * 4);
    expect(state.refresh).not.toHaveBeenCalled();
    state.visible(true);
    state.controller.refresh();
    expect(state.refresh).toHaveBeenCalledOnce();
    state.controller.stop();
  });

  it("shows stale information on timeout and clears it only after recovery", () => {
    const { controller, refresh } = setup();
    controller.refresh();
    vi.advanceTimersByTime(PUBLIC_REFRESH_TIMEOUT_MS);
    expect(controller.getSnapshot()).toBe("unavailable");
    controller.refresh();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toBe("unavailable");
    controller.acknowledge("recovered");
    expect(controller.getSnapshot()).toBe("current");
    controller.stop();
  });

  it("does not request updates offline and retries when connectivity returns", () => {
    const state = setup();
    state.online(false);
    state.controller.offline();
    state.controller.refresh();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.controller.getSnapshot()).toBe("unavailable");
    state.online(true);
    state.controller.refresh();
    expect(state.refresh).toHaveBeenCalledOnce();
    state.controller.stop();
  });

  it("cleans up polling and request timeouts when unmounted", () => {
    const { controller, refresh } = setup();
    controller.refresh();
    controller.stop();
    vi.advanceTimersByTime(PUBLIC_REFRESH_MS * 10);
    expect(refresh).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
