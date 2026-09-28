import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiError, type InfraiClient } from "./infrai_client.js";

export const mxReleaseRequestSchema = z.object({
  domain: z.string().trim().min(1),
  buildId: z.string().trim().min(1),
  exchanges: z.array(z.object({
    host: z.string().trim().min(1),
    priority: z.number().int().min(0).max(65535),
  })).min(1),
}).strict();

export type MxReleaseRequest = z.infer<typeof mxReleaseRequestSchema>;

export type ReleaseEvent = {
  type: "build.accepted" | "record.applied" | "release.completed";
  detail: string;
};

export function planMxRecords(exchanges: MxReleaseRequest["exchanges"]) {
  const seenHosts = new Set<string>();
  const seenPriorities = new Set<number>();
  return exchanges
    .map((exchange) => ({ host: exchange.host.toLowerCase().replace(/\.$/, ""), priority: exchange.priority }))
    .sort((a, b) => a.priority - b.priority || a.host.localeCompare(b.host))
    .filter((exchange) => {
      if (seenHosts.has(exchange.host)) return false;
      if (seenPriorities.has(exchange.priority)) {
        throw new Error(`MX priority ${exchange.priority} is assigned to more than one host`);
      }
      seenHosts.add(exchange.host);
      seenPriorities.add(exchange.priority);
      return true;
    });
}

function readZoneId(data: unknown): string {
  const parsed = z.object({ zone_id: z.string().min(1) }).safeParse(data);
  if (!parsed.success) throw new Error("Domain response did not contain zone_id");
  return parsed.data.zone_id;
}

function stableKey(buildId: string, value: string): string {
  return createHash("sha256").update(`${buildId}:${value}`).digest("hex");
}

export async function releaseMxConfiguration(client: InfraiClient, input: MxReleaseRequest) {
  const plan = planMxRecords(input.exchanges);
  const events: ReleaseEvent[] = [
    { type: "build.accepted", detail: `${input.buildId}: ${plan.length} MX records planned` },
  ];

  let domainData: unknown;
  try {
    domainData = await client.dns.domain.get(input.domain);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    domainData = await client.dns.domain.add(input.domain, stableKey(input.buildId, input.domain));
  }
  const zoneId = readZoneId(domainData);

  for (const exchange of plan) {
    await client.dns.record.upsert(
      {
        zone_id: zoneId,
        record_type: "MX",
        name: input.domain,
        content: exchange.host,
        priority: exchange.priority,
      },
      stableKey(input.buildId, `${exchange.priority}:${exchange.host}`),
    );
    events.push({ type: "record.applied", detail: `${exchange.priority} ${exchange.host}` });
  }

  const configuredSendingDomains = await client.email.domain.list();
  events.push({ type: "release.completed", detail: `${input.domain} now points at ${plan[0].host}` });

  return {
    buildId: input.buildId,
    zoneId,
    primaryExchange: plan[0],
    appliedRecords: plan,
    configuredSendingDomains,
    events,
  };
}
