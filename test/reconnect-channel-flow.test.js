import { describe, it, expect } from "bun:test";
import { createLiveChannel, nextReconnectDelay } from "../app.js";

// Hand-rolled fake EventSource. Mirrors the surface createLiveChannel
// touches: assignable `onmessage`, `onerror`, `onopen`, and `close()`.
function makeFakeEventSource() {
  const opened = [];
  function eventSourceFactory(url) {
    const src = {
      url,
      onmessage: null,
      onerror: null,
      onopen: null,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    opened.push(src);
    return src;
  }
  return { eventSourceFactory, opened };
}

// Hand-rolled fake scheduler. Records every (fn, ms) and fires only when
// the test calls fire().
function makeFakeScheduler() {
  const calls = [];
  function scheduleTimeout(fn, ms) {
    calls.push({ fn, ms });
  }
  function fireNext() {
    const next = calls.shift();
    if (!next) throw new Error("no scheduled call");
    next.fn();
  }
  return { scheduleTimeout, calls, fireNext };
}

describe("createLiveChannel — message delivery", () => {
  it("opens a channel via eventSource(url) on construction", () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async () => ({ json: async () => [] }),
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: () => {},
      onReplaceAll: () => {},
    });
    expect(es.opened.length).toBe(1);
    expect(es.opened[0].url).toBe("/events/stream");
  });

  it("forwards each onmessage payload to onMessage parsed via JSON.parse", () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    const received = [];
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async () => ({ json: async () => [] }),
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: (record) => received.push(record),
      onReplaceAll: () => {},
    });
    const channel = es.opened[0];
    channel.onmessage({ data: JSON.stringify({ id: "a", status: "working" }) });
    channel.onmessage({ data: JSON.stringify({ id: "b", status: "idle" }) });
    expect(received).toEqual([
      { id: "a", status: "working" },
      { id: "b", status: "idle" },
    ]);
  });
});

describe("createLiveChannel — error-triggered reconnect scheduling", () => {
  it("on onerror, closes the current channel and schedules exactly one reconnect at nextReconnectDelay(0)", () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async () => ({ json: async () => [] }),
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: () => {},
      onReplaceAll: () => {},
    });
    const first = es.opened[0];
    first.onerror({});
    expect(first.closed).toBe(true);
    expect(sched.calls.length).toBe(1);
    expect(sched.calls[0].ms).toBe(nextReconnectDelay(0));
  });

  it("consecutive onerrors before any timeout fires climb the backoff ladder", () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async () => ({ json: async () => [] }),
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: () => {},
      onReplaceAll: () => {},
    });
    const first = es.opened[0];
    first.onerror({});
    first.onerror({});
    first.onerror({});
    expect(sched.calls.length).toBe(3);
    expect(sched.calls.map((c) => c.ms)).toEqual([
      nextReconnectDelay(0),
      nextReconnectDelay(1),
      nextReconnectDelay(2),
    ]);
  });
});
