import { NextRequest } from "next/server";

export type ProxyMode = "direct" | "http" | "https";

export interface ProxyConfig {
  mode: ProxyMode;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface PublicProxyConfig {
  mode: ProxyMode;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
}

export const PROXY_COOKIE_NAME = "fbmie_proxy_cfg";

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  mode: "direct",
  host: "",
  port: 8080,
  username: "",
  password: "",
};

const BLOCKED_PROXY_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
  "100.100.100.200",
]);

export function validateProxyConfig(input: Partial<ProxyConfig>): {
  valid: boolean;
  config?: ProxyConfig;
  error?: string;
} {
  const mode: ProxyMode =
    input.mode === "http" || input.mode === "https" || input.mode === "direct"
      ? input.mode
      : "direct";

  if (mode === "direct") {
    return { valid: true, config: { ...DEFAULT_PROXY_CONFIG } };
  }

  const host = String(input.host || "").trim();
  if (!host) {
    return { valid: false, error: "Proxy host is required when proxy mode is enabled." };
  }
  if (/[\s/@?#]/.test(host) || host.length > 253) {
    return {
      valid: false,
      error: "Enter a hostname or IP only (without http://, port, or path).",
    };
  }
  const lowerHost = host.toLowerCase();
  if (BLOCKED_PROXY_HOSTS.has(lowerHost) || lowerHost.startsWith("169.254.")) {
    return { valid: false, error: "Cloud metadata addresses cannot be used as a proxy host." };
  }

  const portNum = Number(input.port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { valid: false, error: "Proxy port must be an integer between 1 and 65535." };
  }

  const username = String(input.username || "").trim().slice(0, 128);
  const password = String(input.password || "").slice(0, 256);

  return {
    valid: true,
    config: {
      mode,
      host,
      port: portNum,
      username,
      password,
    },
  };
}

export function serializeProxyConfig(cfg: ProxyConfig): string {
  return Buffer.from(JSON.stringify(cfg), "utf8").toString("base64url");
}

export function deserializeProxyConfig(raw: string | undefined | null): ProxyConfig {
  if (!raw) return { ...DEFAULT_PROXY_CONFIG };
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<ProxyConfig>;
    const check = validateProxyConfig(parsed);
    return check.valid && check.config ? check.config : { ...DEFAULT_PROXY_CONFIG };
  } catch {
    return { ...DEFAULT_PROXY_CONFIG };
  }
}

export function readProxyConfigFromRequest(req: NextRequest): ProxyConfig {
  const cookieVal = req.cookies.get(PROXY_COOKIE_NAME)?.value;
  return deserializeProxyConfig(cookieVal);
}

export function toPublicProxyConfig(cfg: ProxyConfig): PublicProxyConfig {
  return {
    mode: cfg.mode,
    host: cfg.host,
    port: cfg.port || 8080,
    username: cfg.username || "",
    hasPassword: Boolean(cfg.password),
  };
}

export function buildProxyUrl(cfg: ProxyConfig): string | null {
  if (cfg.mode === "direct" || !cfg.host) return null;
  const protocol = cfg.mode === "https" ? "https" : "http";
  const hostFormatted = cfg.host.includes(":") && !cfg.host.startsWith("[") ? `[${cfg.host}]` : cfg.host;
  if (cfg.username) {
    const u = encodeURIComponent(cfg.username);
    const p = encodeURIComponent(cfg.password || "");
    return `${protocol}://${u}:${p}@${hostFormatted}:${cfg.port}`;
  }
  return `${protocol}://${hostFormatted}:${cfg.port}`;
}
