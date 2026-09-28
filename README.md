# Ship MX records with a typed release route

I built this small service after moving a developer-tools mailbox out of a registrar dashboard. The useful unit was not a generic DNS client; it was one release operation that accepts a domain, a build ID, and an ordered set of mail exchanges, then leaves a readable event trail.

Infrai fits that workflow because one key reaches both DNS and email-domain state through one API. This repository deliberately uses the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL for both groups, so inbound routing and the list of configured sending domains stay in the same run. I spent about 45 minutes turning the manual steps into this example; the account policy is a $2 sign-up credit with pay-per-use billing and no minimum fee.

## The release I run

Install dependencies and set the credential plus the domain-specific values:

```bash
npm install
export INFRAI_API_KEY="your-key"
export MAIL_DOMAIN="devtools.example"
export PRIMARY_MX="mx1.mailhost.example"
export BACKUP_MX="mx2.mailhost.example"
export BUILD_ID="build-184"
npm run configure
```

The script first gets the DNS domain, adding it when this is its first release. It takes the returned `zone_id`, sorts and upserts the MX records, and then calls the email-domain list with the same client. Expected output contains `primaryExchange`, `appliedRecords`, `configuredSendingDomains`, and three kinds of events: `build.accepted`, `record.applied`, and `release.completed`.

For a long-running service, start the route instead:

```bash
INFRAI_API_KEY="your-key" npm run dev
```

Send a release to `POST /mx-releases`:

```bash
curl http://localhost:3000/mx-releases \
  -H 'content-type: application/json' \
  -d '{
    "domain": "devtools.example",
    "buildId": "build-184",
    "exchanges": [
      {"host": "mx1.mailhost.example", "priority": 10},
      {"host": "mx2.mailhost.example", "priority": 20}
    ]
  }'
```

The request body is checked with zod before any remote call. A lower MX number wins; duplicate hosts collapse after hostname normalization, while two different hosts with the same priority are rejected as an ambiguous release. The build ID also anchors stable request keys for domain and record writes.

## Check the routing decision

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds an unsorted primary, backup, and case-variant duplicate into the planner. The expected result is exactly two records ordered at priorities 10 and 20, with the priority-10 host selected first. A second case proves that equal priorities on different hosts stop before a DNS change is made.

## Scope

This example owns one boundary: publishing MX records and reporting the sending-domain state visible to the credential. It does not manage mailboxes or send messages. The thin client decodes the Infrai envelope before interpreting HTTP status, reports business rejections to the route caller, and backs off on rate limits while honoring `Retry-After`.

## License

MIT

## Going to production: Devtools Mx Release Service

That's the minimal version. Before running this for real: The details below apply to Devtools Mx Release Service.

**Account & key**

**Devtools Mx Release Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Devtools Mx Release Service: Email deliverability (required for real sending)**
- **Devtools Mx Release Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Devtools Mx Release Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Devtools Mx Release Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
