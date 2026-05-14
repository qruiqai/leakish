export const DETECT_TIMEOUTS = {
  webrtcMs: 5000,
  audioMs: 1000,
} as const;

// Mix of global + China-reachable STUN endpoints. Google STUN is unreliable
// behind the GFW; Cloudflare/QQ/MiWiFi give us a working fallback so detection
// doesn't silently report "no leak" when all servers are just unreachable.
export const STUN_SERVERS: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.qq.com:3478',
  'stun:stun.miwifi.com:3478',
];

export const DOH_RESOLVE_ENDPOINT = 'https://dns.google/resolve';

// CDP remote-debugging detection
export const CDP_DEFAULT_PORTS = [9222, 9229, 9223, 9224, 9225] as const;
// Two randomized high-port baselines — if one is unexpectedly occupied (e.g.
// a dev server), the probe falls back to the other. Both are well outside
// ephemeral-port ranges commonly used by Node/Python debuggers.
export const CDP_CONTROL_PORTS = [39172, 41337] as const;
// 5 rounds gives us a usable stddev; 3 was too noisy to discriminate the
// 5-15ms open/closed delta on localhost.
export const CDP_PROBE_ROUNDS = 5;
// localhost RTT is typically <5ms; 500ms is plenty and keeps worst-case bounded.
export const CDP_PROBE_TIMEOUT_MS = 500;
export const CDP_PROBE_INTERVAL_MS = 50;
export const CDP_ADDRESSES = ['127.0.0.1', 'localhost'] as const;
// Hard ceiling for the whole Signal 2 phase (parallel probes + control).
export const CDP_SIGNAL2_TOTAL_TIMEOUT_MS = 8000;
// Adaptive "likely open" delta threshold is computed as
//   max(CDP_THRESHOLD_FLOOR_MS, controlMean * CDP_THRESHOLD_CONTROL_RATIO,
//       controlStddev * CDP_THRESHOLD_STDDEV_MULTIPLIER)
// so a pathologically-zero stddev or an unusually fast control never collapses
// the threshold to 0 ms and produces false positives.
export const CDP_THRESHOLD_STDDEV_MULTIPLIER = 3;
export const CDP_THRESHOLD_CONTROL_RATIO = 0.5;
export const CDP_THRESHOLD_FLOOR_MS = 10;
// Fallback stddev (ms) when we have <2 successful control samples.
export const CDP_FALLBACK_STDDEV_MS = 10;
// Minimum successful samples required to trust a port probe's average; below
// this we mark the probe as inconclusive rather than let noise drive likelyOpen.
export const CDP_MIN_VALID_SAMPLES = 2;
