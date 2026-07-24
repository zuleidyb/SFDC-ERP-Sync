# SFDC-ERP-Sync

A Salesforce-centered integration project simulating a real enterprise pattern: syncing order data out of Salesforce into an external ERP system via Change Data Capture, with a live operations dashboard for monitoring and retrying failed syncs.

Built to mirror the kind of work a Salesforce Integration Developer does on an enterprise team: event-driven sync off Change Data Capture, JWT bearer service-to-service auth (no stored passwords), idempotent upserts, and observability into a sync pipeline that can fail and recover.

## Screenshots

**Live Ops Dashboard**

![Ops Dashboard](screenshots/dashboard.png)

**A real Change Data Capture event, captured off Salesforce**

![CDC Event](screenshots/cdc-json.png)

## Architecture

Four pieces:

- **Salesforce** (`force-app/`) - `Order__c` and `Inventory__c` custom objects, Change Data Capture enabled, a least-privilege permission set, and a Connected App configured for the OAuth JWT bearer flow.
- **Integration Service** (`integration-service/`) - a Node.js listener that authenticates to Salesforce via JWT bearer flow (RSA-signed assertion, no password), subscribes to the `Order__ChangeEvent` channel, and syncs changes to the ERP Simulator. Logs every sync attempt, success or failure, for observability.
- **ERP Simulator** (`erp-simulator/`) - an Express + Postgres (Dockerized) REST API standing in for a real ERP like Oracle EBS/Fusion. Stores orders, tracks every sync event with retry support, and exposes `/metrics` for the dashboard.
- **Ops Dashboard** (`dashboard/`) - a Vue 3 + Vite app polling the ERP Simulator: live metric tiles, a color-coded sync event feed with one-click retry, and an orders table.

## Notable engineering decisions

- **CDC over polling**: Salesforce is the system of record for orders, so outbound sync is event-driven via Change Data Capture rather than a scheduled poll.
- **Idempotent upserts**: the ERP Simulator keys on `sfdc_order_id`, so a redelivered CDC event updates the existing row instead of creating a duplicate.
- **A real bug, caught and fixed**: Salesforce CDC `UPDATE` events only include the fields that actually changed, not the full record. An early version of the sync treated the payload as the complete desired state and silently nulled out fields that were not part of the change. Fixed with true partial-update semantics on both the consumer and the ERP API - a good example of a CDC-specific gotcha that is easy to miss.
- **Known limitation**: the CDC payload's `Account__c` is the Account's record Id, not its Name, since Change Data Capture does not traverse relationships by default. A production version would add `Account.Name` as an enriched field on the channel member, or do a follow-up SOQL query.
- **Observability layer scoped in**: rather than reaching for Datadog, a lightweight `sync_events` table plus a Vue dashboard covers the same need for this project's scale - explicitly a simplification, called out rather than hidden.

## Setup

Prerequisites: Salesforce CLI, Node 18+, Docker.

**Salesforce:**

```
sf project deploy start --source-dir force-app
sf org assign permset --name SFDC_ERP_Sync_Access
```

Then create a Connected App with digital signatures enabled (JWT bearer flow) and note the Consumer Key.

**ERP Simulator:**

```
cd erp-simulator
docker compose up -d
npm install
npm run dev
```

**Integration Service:**

```
cd integration-service
npm install
# configure .env: SF_CONSUMER_KEY, SF_USERNAME, SF_LOGIN_URL, SF_PRIVATE_KEY_PATH, ERP_API_URL
node index.js
```

**Dashboard:**

```
cd dashboard
npm install
npm run dev
```

## What's next

- DELETE change event handling
- Reverse sync: ERP inventory changes pushed back into Salesforce via REST API
- Automated tests: Apex, Jest, and Postman contract tests
- CI/CD pipeline via GitHub Actions
