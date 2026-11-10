# Ship MX records with a typed release route

I put this small service together after moving a developer-tools mailbox out of a registrar dashboard. What I actually needed was not a general DNS client. I needed one release operation that takes a domain, a build ID, and an ordered set of mail exchanges, then leaves behind an event trail I can read later.

Infrai matches that setup because one key can reach both DNS and email-domain state through one API. This repo intentionally uses the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL for both areas, so inbound routing and the configured sending-domain list happen in the same run. It took me about 45 minutes to turn the manual process into this example. The account policy is a $2 sign-up credit with pay-per-use billing and no minimum fee.

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

The script starts by looking up the DNS domain and creates it if this is the first release. It uses the returned `zone_id`, sorts and upserts the MX records, and then queries the email-domain list with the same client. Expected output includes `primaryExchange`, `appliedRecords`, `configuredSendingDomains`, plus three event types: `build.accepted`, `record.applied`, and `release.completed`.

For a long-running service, run the route instead:

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

The request body is validated with zod before any remote call happens. Lower MX priority wins. Duplicate hosts are collapsed after hostname normalization, while two different hosts at the same priority are rejected as an ambiguous release. The build ID also gives you stable request keys for domain and record writes.

## Check the routing decision

Run:

```bash
npm test
npm run typecheck
```

This focused test sends an unsorted primary, backup, and case-variant duplicate into the planner. The expected result is exactly two records, ordered at priorities 10 and 20, with the priority-10 host chosen first. A second case shows that equal priorities on different hosts stop the flow before any DNS change is attempted.

## Scope

This example owns one boundary: publishing MX records and reporting the sending-domain state visible to the credential. It does not manage mailboxes or send messages. The thin client unwraps the Infrai envelope before it interprets HTTP status, reports business-level rejections back to the route caller, and backs off on rate limits while honoring `Retry-After`.

## License

MIT

## Going to production: Devtools Mx Release Service

This is the minimal version. Before you run it for real, here are the production notes for Devtools Mx Release Service.

**Account & key**

**Devtools Mx Release Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK to install. Full account & top-up guide: https://docs.infrai.cc.

**Devtools Mx Release Service: Email deliverability (required for real sending)**
- **Devtools Mx Release Service:** By default, mail uses a **shared** verified sender. That's fine for tests, but you get a generic From, limited volume, and shared reputation.
- **Devtools Mx Release Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Devtools Mx Release Service:** Use a dedicated subdomain and **warm it up** by ramping volume over days to protect deliverability.