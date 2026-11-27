import { AsyncLocalStorage } from "node:async_hooks";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { buildProxyUrl, DEFAULT_PROXY_CONFIG, ProxyConfig } from "./proxy-config";

const proxyContext = new AsyncLocalStorage<ProxyConfig>();

// Keep a small bounded cache of ProxyAgent instances per proxy URI
const agentCache = new Map<string, ProxyAgent>();
const MAX_CACHED_AGENTS = 16;

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const existing = agentCache.get(proxyUrl);
  if (existing) return existing;
  if (agentCache.size >= MAX_CACHED_AGENTS) {
    const firstKey = agentCache.keys().next().value;
    if (firstKey) {
      const old = agentCache.get(firstKey);
      agentCache.delete(firstKey);
      old?.close().catch(() => {});
    }
  }
  const agent = new ProxyAgent({
    uri: proxyUrl,
    connectTimeout: 8000,
  });
  agentCache.set(proxyUrl, agent);
  return agent;
}

export function runWithProxyConfig<T>(config: ProxyConfig, fn: () => Promise<T>): Promise<T> {
  return proxyContext.run(config, fn);
}

export function getActiveProxyConfig(): ProxyConfig {
  return proxyContext.getStore() ?? DEFAULT_PROXY_CONFIG;
}

/**
 * Outbound server-side fetch that transparently routes through the active
 * request's ProxyConfig (via undici ProxyAgent) when configured, or falls
 * back to direct fetch when in direct mode.
 */
export async function serverFetch(
  input: string | URL,
  init: RequestInit = {},
  overrideProxy?: ProxyConfig | null
): Promise<Response> {
  const activeCfg = overrideProxy !== undefined ? overrideProxy : getActiveProxyConfig();
  const proxyUrl = activeCfg ? buildProxyUrl(activeCfg) : null;

  if (!proxyUrl) {
    return fetch(input, init);
  }

  const dispatcher = getProxyAgent(proxyUrl);
  const res = await undiciFetch(input, {
    ...(init as Record<string, unknown>),
    dispatcher,
  });

  // undici Response is structurally compatible with standard Fetch Response in Node 22+
  return res as unknown as Response;
}
