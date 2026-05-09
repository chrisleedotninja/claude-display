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

  it("does not call fetchFn on the initial connection's onopen", async () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    const fetchCalls = [];
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async (url) => {
        fetchCalls.push(url);
        return { json: async () => [] };
      },
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: () => {},
      onReplaceAll: () => {},
    });
    const first = es.opened[0];
    if (typeof first.onopen === "function") first.onopen({});
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalls).toEqual([]);
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

describe("createLiveChannel — re-fetch on reconnect open", () => {
  it("on the reconnect channel's onopen, fetches stateUrl, calls onReplaceAll once with records, then resumes onmessage forwarding", async () => {
    const es = makeFakeEventSource();
    const sched = makeFakeScheduler();
    const fetchCalls = [];
    const replaceCalls = [];
    const messageCalls = [];
    const snapshot = [{ id: "a", status: "working" }];
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: es.eventSourceFactory,
      fetchFn: async (url) => {
        fetchCalls.push(url);
        return { json: async () => snapshot };
      },
      scheduleTimeout: sched.scheduleTimeout,
      onMessage: (record) => messageCalls.push(record),
      onReplaceAll: (records) => replaceCalls.push(records),
    });

    // Trigger error -> close -> schedule -> fire timeout to open new channel.
    const first = es.opened[0];
    first.onerror({});
    sched.fireNext();
    expect(es.opened.length).toBe(2);
    const second = es.opened[1];

    // Frames that arrive before the snapshot returns must NOT be forwarded.
    second.onmessage({ data: JSON.stringify({ id: "x", status: "stale" }) });
    expect(messageCalls).toEqual([]);

    // Reconnect open: fetch + replace.
    second.onopen({});
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalls).toEqual(["/api/state"]);
    expect(replaceCalls).toEqual([snapshot]);

    // Subsequent onmessage frames are forwarded again.
    second.onmessage({ data: JSON.stringify({ id: "b", status: "idle" }) });
    expect(messageCalls).toEqual([{ id: "b", status: "idle" }]);
  });

  it("if the new channel errors before onopen, the attempt counter advances and schedules with the next backoff step", () => {
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
    first.onerror({}); // schedules with delay nextReconnectDelay(0)
    expect(sched.calls.map((c) => c.ms)).toEqual([nextReconnectDelay(0)]);
    sched.fireNext();
    const second = es.opened[1];
    second.onerror({}); // before onopen — counter advances
    expect(sched.calls.map((c) => c.ms)).toEqual([nextReconnectDelay(1)]);
    sched.fireNext();
    const third = es.opened[2];
    third.onerror({});
    expect(sched.calls.map((c) => c.ms)).toEqual([nextReconnectDelay(2)]);
  });

  it("after a successful reconnect, the next error schedules with delay = nextReconnectDelay(0) again (counter reset)", async () => {
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
    first.onerror({}); // climbed two rungs without an open
    expect(sched.calls.map((c) => c.ms)).toEqual([
      nextReconnectDelay(0),
      nextReconnectDelay(1),
    ]);

    // Fire the most recently scheduled reconnect.
    const fn = sched.calls.pop().fn;
    sched.calls.length = 0;
    fn();
    const reopened = es.opened[es.opened.length - 1];
    reopened.onopen({});
    // Let the fetch + replace promise chain settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Next error should now schedule with the bottom of the ladder.
    reopened.onerror({});
    expect(sched.calls.map((c) => c.ms)).toEqual([nextReconnectDelay(0)]);
  });
});
