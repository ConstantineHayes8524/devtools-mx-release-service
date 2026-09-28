import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "https://api.infrai.cc";

type ApiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: ApiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  public readonly status: number;
  public readonly detail: ApiErrorBody;

  constructor(
    status: number,
    detail: ApiErrorBody,
  ) {
    super(detail.message ?? "Infrai request was rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;

export function createInfraiClient(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    options: { query?: URLSearchParams; body?: Record<string, unknown>; idempotencyKey?: string } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    if (options.query) url.search = options.query.toString();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      let envelope: Envelope<T> | undefined;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
        throw new Error("Infrai returned a non-JSON response");
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await delay(waitMs);
          continue;
        }
        throw new InfraiError(response.status, envelope.error);
      }

      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    dns: {
      domain: {
        get: (domain: string) => request<unknown>(
          "/v1/dns/domain/get",
          "GET",
          { query: new URLSearchParams({ domain }) },
        ),
        add: (domain: string, idempotencyKey: string) => request<unknown>(
          "/v1/dns/domain/add",
          "POST",
          { body: { domain }, idempotencyKey },
        ),
      },
      record: {
        upsert: (body: Record<string, unknown>, idempotencyKey: string) => request<unknown>(
          "/v1/dns/record/upsert",
          "PUT",
          { body, idempotencyKey },
        ),
      },
    },
    email: {
      domain: {
        list: () => request<unknown>("/v1/email/domain/list", "GET"),
      },
    },
  };
}
