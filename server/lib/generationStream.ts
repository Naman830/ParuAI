/**
 * In-memory pub/sub registry that lets a browser watch a generation that is
 * already running as a fire-and-forget background job.
 *
 * THE JOB IS DB-AUTHORITATIVE; THIS STREAM IS PURELY COSMETIC. createUserProject
 * answers `{ projectId }` and then calls `void generateInitialWebsite(...)`, so
 * the work outlives the request that started it and the browser watches it over
 * a separate long-lived GET. Nothing here is ever the source of truth: the
 * client never persists, saves or downloads stream bytes, and on every terminal
 * event it refetches the project from the API. That invariant is what makes
 * truncation, dropped frames, evicted subscribers and buffer caps ugly but never
 * corrupting — the worst case is a preview that looks incomplete until the
 * refetch lands. current_code and Version.code still come only from the
 * accumulated string run through extractHtml() in the controller.
 *
 * Consequently NOTHING in here may ever cancel, abort or await the generation.
 */
import type { Request, Response } from "express";

export type GenerationPhase = "queued" | "enhancing" | "generating" | "saving";
export type GenerationKind = "initial" | "revision";

export type StreamEvent =
  | {
      type: "snapshot";
      kind: GenerationKind;
      phase: GenerationPhase;
      text: string;
      bytes: number;
      truncated: boolean;
    }
  | { type: "delta"; text: string; bytes: number; truncated: boolean }
  | {
      type: "status";
      kind: GenerationKind;
      phase: GenerationPhase;
      bytes: number;
    }
  | { type: "done"; status: "ready" }
  | { type: "failed"; status: "failed" | "ready"; message: string };

/** The two frames that end a stream. Recorded so late attachers still get one. */
type TerminalEvent = Extract<StreamEvent, { type: "done" | "failed" }>;

export interface GenerationJobHandle {
  setPhase(phase: GenerationPhase): void;
  push(text: string): void;
  /** Idempotent. `outcome` is the status the DOCUMENT ends in, not the request's. */
  finish(outcome: "ready" | "failed", message?: string): void;
}

/**
 * Frames are coalesced onto this cadence instead of being written per chunk.
 * OpenRouter models emit 20-100 chunks/sec, and one res.write + one React
 * setState per token strobed the preview iframe unreadably.
 */
const TICK_MS = 150;

/** Comment frame that keeps proxies (and Render's router) from reaping an idle stream. */
const HEARTBEAT_MS = 15_000;

/** Replay buffer cap. A generated page is ~40KB, so this is ~12 pages of slack. */
const MAX_BUFFER_CHARS = 512 * 1024;

export const MAX_SUBSCRIBERS_PER_PROJECT = 4;

/** Hard ceiling on one socket, so a forgotten tab can't hold a channel forever. */
const MAX_STREAM_LIFETIME_MS = 15 * 60_000;

/** How long a finished channel stays resident so a reconnect still sees its terminal frame. */
const CHANNEL_LINGER_MS = 30_000;

/** Beyond this much unflushed data the peer has stopped reading; drop it rather than buffer. */
const MAX_SOCKET_BACKLOG = 2 * 1024 * 1024;

/** Bounds the browser's own EventSource reconnect delay. */
const SSE_RETRY_MS = 10_000;

interface Subscriber {
  res: Response;
  /** Cursor into Channel.buffer. A late subscriber is just a small offset. */
  offset: number;
  phaseSeen: GenerationPhase;
  lastFrameAt: number;
  closed: boolean;
  lifetimeTimer: NodeJS.Timeout | null;
}

interface Channel {
  kind: GenerationKind;
  phase: GenerationPhase;
  /** Bumped by every openJob so handles from a superseded run go inert. */
  epoch: number;
  buffer: string;
  totalBytes: number;
  truncated: boolean;
  live: boolean;
  terminal: TerminalEvent | null;
  subscribers: Set<Subscriber>;
  tick: NodeJS.Timeout | null;
  linger: NodeJS.Timeout | null;
}

const channels = new Map<string, Channel>();

/**
 * Writes one SSE frame.
 *
 * JSON.stringify escapes real newlines as the two characters \ and n, which is
 * exactly why a whole HTML document (which is nothing but newlines) can ride a
 * single `data:` line. NEVER pretty-print this JSON: one embedded literal
 * newline splits the frame in two and desyncs the protocol for the rest of the
 * connection.
 */
const writeEvent = (res: Response, payload: StreamEvent): boolean => {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    // EPIPE/ERR_STREAM_DESTROYED on a socket that died between our check and
    // this write. The caller drops the subscriber.
    return false;
  }
};

const isWritable = (sub: Subscriber): boolean =>
  !sub.closed &&
  !sub.res.writableEnded &&
  !sub.res.destroyed &&
  sub.res.writableLength <= MAX_SOCKET_BACKLOG;

/** Ends one subscriber's response and unhooks it. Idempotent. */
const detach = (projectId: string, channel: Channel, sub: Subscriber): void => {
  if (sub.closed) return;
  sub.closed = true;

  if (sub.lifetimeTimer) {
    clearTimeout(sub.lifetimeTimer);
    sub.lifetimeTimer = null;
  }

  channel.subscribers.delete(sub);

  try {
    sub.res.end();
  } catch {
    // Already torn down by the peer; nothing to do.
  }

  if (channel.subscribers.size === 0) {
    stopTick(channel);
    // A channel with no watchers and no job is dead weight: without this the
    // Map keeps one entry per projectId ever streamed for the process lifetime.
    if (!channel.live) scheduleDestroy(projectId, channel);
  }
};

const send = (
  projectId: string,
  channel: Channel,
  sub: Subscriber,
  payload: StreamEvent,
): boolean => {
  if (!isWritable(sub) || !writeEvent(sub.res, payload)) {
    detach(projectId, channel, sub);
    return false;
  }
  sub.lastFrameAt = Date.now();
  return true;
};

/**
 * Brings one subscriber up to date: phase change first, then whatever the
 * buffer advanced by. Replay-for-a-late-subscriber and live-tail are the same
 * code path here, which is what makes an attach mid-generation race-free
 * without any locking.
 */
const drain = (
  projectId: string,
  channel: Channel,
  sub: Subscriber,
): "dropped" | "wrote" | "idle" => {
  let wrote = false;

  if (sub.phaseSeen !== channel.phase) {
    if (
      !send(projectId, channel, sub, {
        type: "status",
        kind: channel.kind,
        phase: channel.phase,
        bytes: channel.totalBytes,
      })
    ) {
      return "dropped";
    }
    sub.phaseSeen = channel.phase;
    wrote = true;
  }

  if (sub.offset < channel.buffer.length) {
    const slice = channel.buffer.slice(sub.offset);
    if (
      !send(projectId, channel, sub, {
        type: "delta",
        text: slice,
        bytes: channel.totalBytes,
        truncated: channel.truncated,
      })
    ) {
      return "dropped";
    }
    sub.offset += slice.length;
    wrote = true;
  }

  return wrote ? "wrote" : "idle";
};

const runTick = (projectId: string, channel: Channel): void => {
  const now = Date.now();

  // Deleting from a Set while iterating it is safe, so a subscriber dropped by
  // drain() mid-loop does not disturb the others.
  for (const sub of channel.subscribers) {
    const result = drain(projectId, channel, sub);
    if (result !== "idle") continue;

    if (now - sub.lastFrameAt >= HEARTBEAT_MS) {
      if (!isWritable(sub)) {
        detach(projectId, channel, sub);
        continue;
      }
      try {
        // Raw SSE comment: ignored by EventSource, but it keeps the socket and
        // any intermediary from treating a slow enhance step as a dead stream.
        sub.res.write(": ping\n\n");
        sub.lastFrameAt = now;
      } catch {
        detach(projectId, channel, sub);
      }
    }
  }
};

const startTick = (projectId: string, channel: Channel): void => {
  if (channel.tick || channel.subscribers.size === 0) return;
  channel.tick = setInterval(() => runTick(projectId, channel), TICK_MS);
  // Never let a cosmetic timer be the reason the process refuses to exit.
  channel.tick.unref();
};

const stopTick = (channel: Channel): void => {
  if (!channel.tick) return;
  clearInterval(channel.tick);
  channel.tick = null;
};

const destroyChannel = (projectId: string): void => {
  const channel = channels.get(projectId);
  if (!channel) return;

  stopTick(channel);
  for (const sub of Array.from(channel.subscribers)) {
    detach(projectId, channel, sub);
  }

  if (channel.linger) {
    clearTimeout(channel.linger);
    channel.linger = null;
  }

  // A handle may still be held by a job that never called finish(); bumping the
  // epoch makes its push() a no-op instead of growing a buffer nobody can read.
  channel.epoch += 1;
  channels.delete(projectId);
};

const scheduleDestroy = (projectId: string, channel: Channel): void => {
  if (channel.linger) clearTimeout(channel.linger);
  channel.linger = setTimeout(() => {
    // Identity check: a new run may have claimed this projectId in the meantime.
    if (channels.get(projectId) === channel) destroyChannel(projectId);
  }, CHANNEL_LINGER_MS);
  channel.linger.unref();
};

const getOrCreateChannel = (
  projectId: string,
  kind: GenerationKind,
): Channel => {
  const existing = channels.get(projectId);
  if (existing) return existing;

  const channel: Channel = {
    kind,
    phase: "queued",
    epoch: 0,
    buffer: "",
    totalBytes: 0,
    truncated: false,
    live: false,
    terminal: null,
    subscribers: new Set<Subscriber>(),
    tick: null,
    linger: null,
  };
  channels.set(projectId, channel);
  return channel;
};

/** The snapshot doubles as the replay: it carries the buffer, so the cursor starts at its end. */
const sendSnapshot = (
  projectId: string,
  channel: Channel,
  sub: Subscriber,
): void => {
  sub.offset = channel.buffer.length;
  sub.phaseSeen = channel.phase;
  send(projectId, channel, sub, {
    type: "snapshot",
    kind: channel.kind,
    phase: channel.phase,
    text: channel.buffer,
    bytes: channel.totalBytes,
    truncated: channel.truncated,
  });
};

/**
 * Registers a run and returns the handle the background job writes through.
 *
 * The handle captures the epoch this call installed, so a second generation
 * started on the same project makes the first handle inert. Without that, two
 * concurrent revisions would interleave their tokens into one buffer and the
 * watcher would see shredded HTML.
 */
export function openJob(
  projectId: string,
  kind: GenerationKind,
): GenerationJobHandle {
  const channel = getOrCreateChannel(projectId, kind);

  channel.kind = kind;
  channel.epoch += 1;
  channel.phase = "queued";
  channel.buffer = "";
  channel.totalBytes = 0;
  channel.truncated = false;
  channel.live = true;
  channel.terminal = null;

  if (channel.linger) {
    clearTimeout(channel.linger);
    channel.linger = null;
  }

  // Anyone already attached is holding a cursor into the buffer we just threw
  // away; re-snapshot so their offset cannot point past the new one.
  for (const sub of Array.from(channel.subscribers)) {
    sendSnapshot(projectId, channel, sub);
  }
  startTick(projectId, channel);

  const epoch = channel.epoch;
  const isCurrent = () => channel.epoch === epoch;

  return {
    setPhase(phase: GenerationPhase) {
      if (!isCurrent()) return;
      channel.phase = phase;
    },

    push(text: string) {
      if (!isCurrent() || !text) return;

      // Progress must keep counting past the cap, otherwise the client's byte
      // readout freezes on a long page and looks like a stalled generation.
      channel.totalBytes += text.length;

      const room = MAX_BUFFER_CHARS - channel.buffer.length;
      if (room <= 0) {
        channel.truncated = true;
        return;
      }
      if (text.length > room) {
        channel.buffer += text.slice(0, room);
        channel.truncated = true;
        return;
      }
      channel.buffer += text;
    },

    finish(outcome: "ready" | "failed", message?: string) {
      if (!isCurrent() || channel.terminal) return;

      // `message` is the signal that something went wrong; `outcome` says only
      // what the DOCUMENT ends up as. A failed revision on a project that
      // already had code is therefore ("ready", "..."): the client shows the
      // error but its refetch finds a renderable page.
      const frame: TerminalEvent =
        outcome === "ready" && !message
          ? { type: "done", status: "ready" }
          : {
              type: "failed",
              status: outcome,
              message: message || "Generation failed",
            };

      channel.terminal = frame;
      channel.live = false;

      // Flush now rather than on the next tick: up to TICK_MS of tail is still
      // unsent, and the client tears the stream down the moment it sees this.
      for (const sub of Array.from(channel.subscribers)) {
        if (drain(projectId, channel, sub) === "dropped") continue;
        send(projectId, channel, sub, frame);
        detach(projectId, channel, sub);
      }

      stopTick(channel);
      scheduleDestroy(projectId, channel);
    },
  };
}

export function hasLiveJob(projectId: string): boolean {
  const channel = channels.get(projectId);
  return channel !== undefined && channel.live;
}

export function subscriberCount(projectId: string): number {
  return channels.get(projectId)?.subscribers.size ?? 0;
}

/**
 * Attaches one browser to a project's channel. The ONLY function here that
 * writes response headers.
 */
export function attachSubscriber(params: {
  projectId: string;
  req: Request;
  res: Response;
  /** Non-null => answer immediately from the DB and end the response. */
  terminal: "ready" | "failed" | null;
  kindHint: GenerationKind;
}): void {
  const { projectId, req, res, terminal, kindHint } = params;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // `no-transform` is the load-bearing part: an intermediary that gzips the
  // response also buffers it, and the whole point is bytes arriving early.
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  // Frames are small; Nagle would sit on them waiting for a full segment.
  res.socket?.setNoDelay(true);
  // Bounds how fast the browser retries, so a flapping API isn't hammered.
  res.write(`retry: ${SSE_RETRY_MS}\n\n`);
  // NOTE: there is deliberately no res.flush() anywhere in this file. That
  // method does not exist on Express' Response — it is added by the compression
  // middleware, which is not installed. Calling it throws mid-stream.

  if (terminal !== null) {
    // "Connected after it already finished": the caller resolved the outcome
    // from the DB, so say so and end instead of holding a socket that would
    // never produce a frame.
    writeEvent(
      res,
      terminal === "ready"
        ? { type: "done", status: "ready" }
        : {
            type: "failed",
            status: "failed",
            message: "Generation failed",
          },
    );
    res.end();
    return;
  }

  // A channel with live: false is legal here — the browser routinely connects
  // in the gap between the POST response and openJob() being reached.
  const channel = getOrCreateChannel(projectId, kindHint);

  if (channel.terminal) {
    // The job finished while this request was in flight (the DB read that
    // produced `terminal: null` is older than finish()). Replay and close.
    writeEvent(res, {
      type: "snapshot",
      kind: channel.kind,
      phase: channel.phase,
      text: channel.buffer,
      bytes: channel.totalBytes,
      truncated: channel.truncated,
    });
    writeEvent(res, channel.terminal);
    res.end();
    return;
  }

  const sub: Subscriber = {
    res,
    offset: 0,
    phaseSeen: channel.phase,
    lastFrameAt: Date.now(),
    closed: false,
    lifetimeTimer: null,
  };

  sendSnapshot(projectId, channel, sub);
  if (sub.closed) return; // socket died on the very first write

  channel.subscribers.add(sub);

  // Evict the oldest (Sets iterate in insertion order) rather than refusing the
  // newest: a reconnect loop — StrictMode double-mount, or a proxy killing the
  // stream every few seconds — would otherwise pin four stale sockets and lock
  // the live tab out of its own project.
  while (channel.subscribers.size > MAX_SUBSCRIBERS_PER_PROJECT) {
    const oldest = channel.subscribers.values().next().value;
    if (!oldest) break;
    detach(projectId, channel, oldest);
  }

  sub.lifetimeTimer = setTimeout(() => {
    // A tab left open on a job that never wrote a terminal frame (process
    // restart mid-generation) would hold this socket and its tick forever. The
    // `retry:` above brings a genuinely-still-running stream straight back.
    detach(projectId, channel, sub);
  }, MAX_STREAM_LIFETIME_MS);
  sub.lifetimeTimer.unref();

  startTick(projectId, channel);

  const cleanup = () => {
    if (sub.closed) return;
    // Do NOT abort the job — it is DB-authoritative and must finish so the user
    // gets their site even though nobody is watching.
    detach(projectId, channel, sub);
  };

  // All three fire in different disconnect shapes (client close, socket error,
  // aborted request); cleanup() is guarded by sub.closed so it runs once.
  res.on("close", cleanup);
  res.on("error", cleanup);
  req.on("close", cleanup);
}

// NOTE ON `bytes`: it is String.length, i.e. UTF-16 code units, not UTF-8
// bytes. The field name is a small lie. It is only ever rendered as a progress
// number next to a spinner, and nothing derives a length or an offset in the
// persisted document from it, so the discrepancy on non-ASCII content is
// deliberately ignored rather than paid for with a Buffer.byteLength per chunk.
