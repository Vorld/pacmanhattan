// Product analytics for the PRD's success metrics. Events go to the endpoint
// configured in config.json (as JSON beacons) when set, and are always kept in
// window.__pacmanhattanEvents for debugging.

export type AnalyticsEvent = 'run_start' | 'landmark_visit' | 'hint_shown' | 'caught' | 'target_found';

let endpoint: string | null = null;
const sessionId = getSessionId();
const buffer: unknown[] = [];
(window as unknown as { __pacmanhattanEvents: unknown[] }).__pacmanhattanEvents = buffer;

export function initAnalytics(url: string | null) {
  endpoint = url;
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  const payload = { event, props, sessionId, ts: new Date().toISOString() };
  buffer.push(payload);
  if (import.meta.env.DEV) console.debug('[analytics]', event, props);
  if (endpoint) {
    const body = JSON.stringify(payload);
    if (!navigator.sendBeacon?.(endpoint, body)) {
      void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  }
}

/** Counts runs in this browser session (for "started a second run" retention). */
export function nextRunIndex(): number {
  try {
    const n = Number(sessionStorage.getItem('pacmanhattan.runs') ?? '0') + 1;
    sessionStorage.setItem('pacmanhattan.runs', String(n));
    return n;
  } catch {
    return 1;
  }
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem('pacmanhattan.session');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('pacmanhattan.session', id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}
