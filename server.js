require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});
// Shared upsert logic used by both the normal /orders route and event retries.
async function upsertOrder({ sfdcOrderId, accountName, status, amount }) {
  if (!sfdcOrderId) {
    throw Object.assign(new Error("sfdcOrderId is required"), {
      statusCode: 400
    });
  }
  const existing = await pool.query(
    "SELECT * FROM orders WHERE sfdc_order_id = $1",
    [sfdcOrderId]
  );
  if (existing.rows.length > 0) {
    const fields = [];
    const values = [];
    let i = 1;
    if (accountName !== undefined) {
      fields.push(`account_name = $${i++}`);
      values.push(accountName);
    }
    if (status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(status);
    }
    if (amount !== undefined) {
      fields.push(`amount = $${i++}`);
      values.push(amount);
    }
    if (fields.length === 0) {
      throw Object.assign(new Error("No updatable fields provided"), {
        statusCode: 400
      });
    }
    fields.push("updated_at = now()");
    values.push(sfdcOrderId);
    const result = await pool.query(
      `UPDATE orders SET ${fields.join(", ")} WHERE sfdc_order_id = $${i} RETURNING *`,
      values
    );
    return { action: "updated", order: result.rows[0] };
  }
  if (!status) {
    throw Object.assign(new Error("status is required to create a new order"), {
      statusCode: 400
    });
  }
  const erpOrderId = `ERP-ORD-${Date.now()}`;
  const result = await pool.query(
    `INSERT INTO orders (erp_order_id, sfdc_order_id, account_name, status, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [erpOrderId, sfdcOrderId, accountName || null, status, amount || null]
  );
  return { action: "created", order: result.rows[0] };
}
app.post("/orders", async (req, res) => {
  try {
    const result = await upsertOrder(req.body);
    res.status(result.action === "created" ? 201 : 200).json(result);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
app.get("/orders", async (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true";
  const query = includeDeleted
    ? "SELECT * FROM orders ORDER BY created_at DESC"
    : "SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC";
  const result = await pool.query(query);
  res.json(result.rows);
});
app.delete("/orders/:sfdcOrderId", async (req, res) => {
  const { sfdcOrderId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE orders
       SET deleted_at = now(), updated_at = now()
       WHERE sfdc_order_id = $1
       RETURNING *`,
      [sfdcOrderId]
    );
    if (result.rows.length === 0) {
      return res.json({
        action: "noop",
        message: "No matching order found; nothing to delete."
      });
    }
    res.json({ action: "deleted", order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// Shared upsert logic for inventory, keyed on erp_item_id (the ERP owns this identity).
async function upsertInventory({ erpItemId, productName, quantityOnHand }) {
  if (!erpItemId) {
    throw Object.assign(new Error("erpItemId is required"), {
      statusCode: 400
    });
  }
  const existing = await pool.query(
    "SELECT * FROM inventory WHERE erp_item_id = $1",
    [erpItemId]
  );
  if (existing.rows.length > 0) {
    const fields = [];
    const values = [];
    let i = 1;
    if (productName !== undefined) {
      fields.push(`product_name = $${i++}`);
      values.push(productName);
    }
    if (quantityOnHand !== undefined) {
      fields.push(`quantity_on_hand = $${i++}`);
      values.push(quantityOnHand);
    }
    if (fields.length === 0) {
      throw Object.assign(new Error("No updatable fields provided"), {
        statusCode: 400
      });
    }
    fields.push("updated_at = now()");
    values.push(erpItemId);
    const result = await pool.query(
      `UPDATE inventory SET ${fields.join(", ")} WHERE erp_item_id = $${i} RETURNING *`,
      values
    );
    return { action: "updated", item: result.rows[0] };
  }
  if (productName === undefined || quantityOnHand === undefined) {
    throw Object.assign(
      new Error(
        "productName and quantityOnHand are required to create a new inventory item"
      ),
      { statusCode: 400 }
    );
  }
  const result = await pool.query(
    `INSERT INTO inventory (erp_item_id, product_name, quantity_on_hand)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [erpItemId, productName, quantityOnHand]
  );
  return { action: "created", item: result.rows[0] };
}
// Fire-and-forget: tell the Integration Service an inventory item changed so it can
// push the update into Salesforce. A webhook failure must not fail the ERP write itself.
async function notifyInventoryChanged(item) {
  const webhookUrl =
    process.env.INTEGRATION_SERVICE_URL || "http://localhost:4001";
  await fetch(`${webhookUrl}/webhooks/inventory-changed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      erpItemId: item.erp_item_id,
      productName: item.product_name,
      quantityOnHand: item.quantity_on_hand
    })
  });
}
app.post("/inventory", async (req, res) => {
  try {
    const result = await upsertInventory(req.body);
    res.status(result.action === "created" ? 201 : 200).json(result);
    notifyInventoryChanged(result.item).catch((err) => {
      console.error(
        "Failed to notify Integration Service of inventory change:",
        err.message
      );
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
app.get("/inventory", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM inventory ORDER BY updated_at DESC"
  );
  res.json(result.rows);
});
// Sync event log: every CDC event the Integration Service processes gets recorded here,
// success or failure, along with the original payload so a failure can be retried later.
app.post("/events", async (req, res) => {
  const {
    sfdcRecordId,
    changeType,
    changedFields,
    status,
    errorMessage,
    payload
  } = req.body;
  if (!sfdcRecordId || !changeType || !status || !payload) {
    return res.status(400).json({
      error: "sfdcRecordId, changeType, status, and payload are required"
    });
  }
  try {
    const result = await pool.query(
      `INSERT INTO sync_events (sfdc_record_id, change_type, changed_fields, status, error_message, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        sfdcRecordId,
        changeType,
        changedFields || [],
        status,
        errorMessage || null,
        payload
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/events", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const result = await pool.query(
    "SELECT * FROM sync_events ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  res.json(result.rows);
});
app.get("/metrics", async (req, res) => {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS events_today,
      COUNT(*) FILTER (WHERE status = 'error' AND created_at >= date_trunc('day', now())) AS errors_today,
      COUNT(*) FILTER (WHERE status = 'success' AND created_at >= date_trunc('day', now())) AS success_today,
      MAX(created_at) AS last_event_at
    FROM sync_events
  `);
  res.json(result.rows[0]);
});
app.post("/events/:id/retry", async (req, res) => {
  const { id } = req.params;
  try {
    const eventResult = await pool.query(
      "SELECT * FROM sync_events WHERE id = $1",
      [id]
    );
    const event = eventResult.rows[0];
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    try {
      const upsertResult = await upsertOrder(event.payload);
      const updated = await pool.query(
        `UPDATE sync_events
         SET status = 'success', error_message = NULL, retry_count = retry_count + 1, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return res.json({ event: updated.rows[0], result: upsertResult });
    } catch (retryErr) {
      const updated = await pool.query(
        `UPDATE sync_events
         SET status = 'error', error_message = $1, retry_count = retry_count + 1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [retryErr.message, id]
      );
      return res
        .status(retryErr.statusCode || 500)
        .json({ event: updated.rows[0], error: retryErr.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
const port = process.env.APP_PORT || 4000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`ERP Simulator listening on port ${port}`);
  });
}

module.exports = { app, upsertOrder, upsertInventory };
