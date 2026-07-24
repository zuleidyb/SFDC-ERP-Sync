require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const jsforce = require("jsforce");
const express = require("express");

const ERP_API_URL = process.env.ERP_API_URL || "http://localhost:4000";
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 4001;
const SF_API_VERSION = "v61.0";

const privateKey = fs.readFileSync(
  path.resolve(__dirname, process.env.SF_PRIVATE_KEY_PATH),
  "utf8"
);

let accessToken = null;
let instanceUrl = null;

function buildAssertion() {
  return jwt.sign(
    {
      iss: process.env.SF_CONSUMER_KEY,
      sub: process.env.SF_USERNAME,
      aud: process.env.SF_LOGIN_URL
    },
    privateKey,
    { algorithm: "RS256", expiresIn: "3m" }
  );
}

async function authenticate() {
  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion()
    })
  });

  const authData = await res.json();

  if (!res.ok) {
    throw new Error(`Auth failed: ${JSON.stringify(authData)}`);
  }

  accessToken = authData.access_token;
  instanceUrl = authData.instance_url;
  console.log("Authenticated. Instance URL:", instanceUrl);
}

async function logEvent({
  sfdcRecordId,
  changeType,
  changedFields,
  status,
  errorMessage,
  payload
}) {
  try {
    await fetch(`${ERP_API_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sfdcRecordId,
        changeType,
        changedFields,
        status,
        errorMessage,
        payload
      })
    });
  } catch (err) {
    console.error("Failed to log sync event:", err.message);
  }
}

async function syncOrderToErp(payload, header) {
  const sfdcOrderId = header.recordIds[0];

  const body = { sfdcOrderId };
  if (payload.Account__c !== undefined) body.accountName = payload.Account__c;
  if (payload.Status__c !== undefined) body.status = payload.Status__c;
  if (payload.Amount__c !== undefined) body.amount = payload.Amount__c;

  try {
    const res = await fetch(`${ERP_API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`ERP sync failed for ${sfdcOrderId}:`, data);
      await logEvent({
        sfdcRecordId: sfdcOrderId,
        changeType: header.changeType,
        changedFields: header.changedFields,
        status: "error",
        errorMessage: data.error || "Unknown error from ERP Simulator",
        payload: body
      });
      return;
    }

    console.log(
      `ERP sync ${data.action} for ${sfdcOrderId} -> ${data.order.erp_order_id}`
    );
    await logEvent({
      sfdcRecordId: sfdcOrderId,
      changeType: header.changeType,
      changedFields: header.changedFields,
      status: "success",
      errorMessage: null,
      payload: body
    });
  } catch (err) {
    console.error(`ERP sync error for ${sfdcOrderId}:`, err.message);
    await logEvent({
      sfdcRecordId: sfdcOrderId,
      changeType: header.changeType,
      changedFields: header.changedFields,
      status: "error",
      errorMessage: err.message,
      payload: body
    });
  }
}

async function deleteOrderFromErp(header) {
  const sfdcOrderId = header.recordIds[0];

  try {
    const res = await fetch(`${ERP_API_URL}/orders/${sfdcOrderId}`, {
      method: "DELETE"
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`ERP delete failed for ${sfdcOrderId}:`, data);
      await logEvent({
        sfdcRecordId: sfdcOrderId,
        changeType: header.changeType,
        changedFields: header.changedFields,
        status: "error",
        errorMessage: data.error || "Unknown error from ERP Simulator",
        payload: { sfdcOrderId }
      });
      return;
    }

    console.log(`ERP delete ${data.action} for ${sfdcOrderId}`);
    await logEvent({
      sfdcRecordId: sfdcOrderId,
      changeType: header.changeType,
      changedFields: header.changedFields,
      status: "success",
      errorMessage: null,
      payload: { sfdcOrderId }
    });
  } catch (err) {
    console.error(`ERP delete error for ${sfdcOrderId}:`, err.message);
    await logEvent({
      sfdcRecordId: sfdcOrderId,
      changeType: header.changeType,
      changedFields: header.changedFields,
      status: "error",
      errorMessage: err.message,
      payload: { sfdcOrderId }
    });
  }
}

// Reverse sync: push an ERP-originated inventory change into Salesforce via the
// REST API's upsert-by-external-ID endpoint. Retries once after re-authenticating
// if the access token has expired (401) -- this service runs long enough that
// the original token from startup will not last forever.
async function upsertInventoryInSalesforce(
  erpItemId,
  productName,
  quantityOnHand,
  isRetry = false
) {
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/sobjects/Inventory__c/ERP_Item_Id__c/${encodeURIComponent(erpItemId)}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      Product_Name__c: productName,
      Quantity_On_Hand__c: quantityOnHand,
      Last_Synced_From_ERP__c: new Date().toISOString()
    })
  });

  if (res.status === 401 && !isRetry) {
    console.log("Access token expired, re-authenticating...");
    await authenticate();
    return upsertInventoryInSalesforce(
      erpItemId,
      productName,
      quantityOnHand,
      true
    );
  }

  if (!res.ok && res.status !== 204) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      `Salesforce upsert failed (${res.status}): ${JSON.stringify(errorBody)}`
    );
  }

  if (res.status === 201) {
    const created = await res.json();
    return { action: "created", sfdcId: created.id };
  }

  return { action: "updated", sfdcId: null };
}

function startWebhookServer() {
  const app = express();
  app.use(express.json());

  app.post("/webhooks/inventory-changed", async (req, res) => {
    const { erpItemId, productName, quantityOnHand } = req.body;

    if (!erpItemId) {
      return res.status(400).json({ error: "erpItemId is required" });
    }

    try {
      const result = await upsertInventoryInSalesforce(
        erpItemId,
        productName,
        quantityOnHand
      );
      console.log(`Inventory ${result.action} in Salesforce for ${erpItemId}`);

      await logEvent({
        sfdcRecordId: result.sfdcId || erpItemId,
        changeType: "INVENTORY_UPDATE",
        changedFields: ["Product_Name__c", "Quantity_On_Hand__c"],
        status: "success",
        errorMessage: null,
        payload: { erpItemId, productName, quantityOnHand }
      });

      res.json({ action: result.action });
    } catch (err) {
      console.error(
        `Inventory sync to Salesforce failed for ${erpItemId}:`,
        err.message
      );

      await logEvent({
        sfdcRecordId: erpItemId,
        changeType: "INVENTORY_UPDATE",
        changedFields: ["Product_Name__c", "Quantity_On_Hand__c"],
        status: "error",
        errorMessage: err.message,
        payload: { erpItemId, productName, quantityOnHand }
      });

      res.status(500).json({ error: err.message });
    }
  });

  app.listen(WEBHOOK_PORT, () => {
    console.log(`Webhook receiver listening on port ${WEBHOOK_PORT}`);
  });
}

async function main() {
  await authenticate();

  startWebhookServer();

  const conn = new jsforce.Connection({
    instanceUrl,
    accessToken
  });

  console.log("Subscribing to /data/Order__ChangeEvent ...");
  conn.streaming.topic("/data/Order__ChangeEvent").subscribe((message) => {
    const header = message.payload.ChangeEventHeader;
    console.log(
      `\nCDC event: ${header.changeType} on ${header.entityName} (${header.recordIds[0]})`
    );
    console.log(
      `Changed fields: ${header.changedFields.join(", ") || "(none)"}`
    );

    if (header.changeType === "CREATE" || header.changeType === "UPDATE") {
      syncOrderToErp(message.payload, header);
    } else if (header.changeType === "DELETE") {
      deleteOrderFromErp(header);
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
