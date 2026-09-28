import assert from "node:assert/strict";
import test from "node:test";
import { planMxRecords } from "../src/mx_release_service.js";

test("selects the lowest-priority MX as primary and removes duplicate hosts", () => {
  const plan = planMxRecords([
    { host: "backup.mail.example.", priority: 20 },
    { host: "primary.mail.example", priority: 10 },
    { host: "PRIMARY.mail.example.", priority: 10 },
  ]);

  assert.deepEqual(plan, [
    { host: "primary.mail.example", priority: 10 },
    { host: "backup.mail.example", priority: 20 },
  ]);
});

test("rejects ambiguous priority assignments", () => {
  assert.throws(
    () => planMxRecords([
      { host: "mx-a.example", priority: 10 },
      { host: "mx-b.example", priority: 10 },
    ]),
    /priority 10/,
  );
});
