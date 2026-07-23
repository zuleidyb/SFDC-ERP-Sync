require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const jsforce = require("jsforce");

const ERP_API_URL = process.env.ERP_API_URL || "http://localhost:4000";

const privateKey = fs.readFileSync(
  path.resolve(__dirname, process.env.SF_PRIVATE_KEY_PATH),
  "utf8"
);

const assertion = jwt.sign(
  {
    iss: process.env.SF_CONSUMER_KEY,
    sub: process.env.SF_USERNAME,
    aud: process.env.SF_LOGIN_URL
  },
  privateKey,
  { algorithm: "RS256", expiresIn: "3m" }
);

async function syncOrderToErp(payload, header) {
  const sfdcOrderId = header.recordIds[0];

  // Only forward fields that were actually present in this change event.
  // CDC UPDATE events only include changed fields -- if we defaulted missing
  // fields to null here, we would tell the ERP to erase data that never changed.
  const body = { sfdcOrderId };

  if (payload.Account__c !== undefined) {
    // Note: this is the Account record Id, not its Name -- CDC does not
    // traverse relationships by default. A real implementation would add
    // Account.Name as an enriched field on the channel member, or do a
    // follow-up SOQL query.
    body.accountName = payload.Account__c;
  }
  if (payload.Status__c !== undefined) {
    body.status = payload.Status__c;
  }
  if (payload.Amount__c !== undefined) {
    body.amount = payload.Amount__c;
  }

  try {
    const res = await fetch(`${ERP_API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`ERP sync failed for ${sfdcOrderId}:`, data);
      return;
    }

    console.log(
      `ERP sync ${data.action} for ${sfdcOrderId} -> ${data.order.erp_order_id}`
    );
  } catch (err) {
    console.error(`ERP sync error for ${sfdcOrderId}:`, err.message);
  }
}

async function main() {
  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const authData = await res.json();

  if (!res.ok) {
    console.error("Auth failed:", authData);
    process.exit(1);
  }

  console.log("Authenticated. Instance URL:", authData.instance_url);

  const conn = new jsforce.Connection({
    instanceUrl: authData.instance_url,
    accessToken: authData.access_token
  });

  console.log("Subscribing to /data/Order__ChangeEvent ...");
  conn.streaming.topic("/data/Order__ChangeEvent").subscribe((message) => {
    const header = message.payload.ChangeEventHeader;
    console.log(
      `\nCDC event: ${header.changeType} on ${header.entityName} (${header.recordIds[0]})`
    );
    console.log(
      `Changed fields: ${header.changedFields.join(", ") || "(all, on create)"}`
    );

    if (header.changeType === "CREATE" || header.changeType === "UPDATE") {
      syncOrderToErp(message.payload, header);
    } else {
      console.log(`Skipping changeType ${header.changeType} (not yet handled)`);
    }
  });

  console.log(
    "Listening for Order__c changes and syncing to the ERP Simulator..."
  );
  console.log("Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
