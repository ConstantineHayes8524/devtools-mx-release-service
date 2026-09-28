import { createInfraiClient } from "../src/infrai_client.js";
import { mxReleaseRequestSchema, releaseMxConfiguration } from "../src/mx_release_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running this script");

const input = mxReleaseRequestSchema.parse({
  domain: process.env.MAIL_DOMAIN,
  buildId: process.env.BUILD_ID ?? `local-${new Date().toISOString().slice(0, 10)}`,
  exchanges: [
    { host: process.env.PRIMARY_MX, priority: 10 },
    { host: process.env.BACKUP_MX, priority: 20 },
  ],
});

const result = await releaseMxConfiguration(createInfraiClient(apiKey), input);
console.log(JSON.stringify(result, null, 2));
