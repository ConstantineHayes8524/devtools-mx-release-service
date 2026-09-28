import { createServer } from "node:http";
import { z } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client.js";
import { mxReleaseRequestSchema, releaseMxConfiguration } from "./mx_release_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = createInfraiClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/mx-releases") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = mxReleaseRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 201, await releaseMxConfiguration(client, input));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid release request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message, detail: error.detail });
      return;
    }
    send(response, 500, { error: error instanceof Error ? error.message : "Release failed" });
  }
}).listen(port, () => {
  console.log(`MX release service listening on http://localhost:${port}`);
});
