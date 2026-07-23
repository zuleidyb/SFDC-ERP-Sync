require("dotenv").config();
const express = require("express");
const pool = require("./db");

const app = express();
app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.post("/orders", async (req, res) => {
  const { sfdcOrderId, accountName, status, amount } = req.body;

  if (!sfdcOrderId) {
    return res.status(400).json({ error: "sfdcOrderId is required" });
  }

  try {
    const existing = await pool.query(
      "SELECT * FROM orders WHERE sfdc_order_id = $1",
      [sfdcOrderId]
    );

    if (existing.rows.length > 0) {
      // Partial update: only touch fields actually present in the request body.
      // CDC UPDATE events only include changed fields, so treating a missing
      // field as "set to null" would silently erase data that did not change.
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
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      fields.push("updated_at = now()");
      values.push(sfdcOrderId);

      const result = await pool.query(
        `UPDATE orders SET ${fields.join(", ")} WHERE sfdc_order_id = $${i} RETURNING *`,
        values
      );
      return res.json({ action: "updated", order: result.rows[0] });
    }

    if (!status) {
      return res
        .status(400)
        .json({ error: "status is required to create a new order" });
    }

    const erpOrderId = `ERP-ORD-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO orders (erp_order_id, sfdc_order_id, account_name, status, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [erpOrderId, sfdcOrderId, accountName || null, status, amount || null]
    );
    res.status(201).json({ action: "created", order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/orders", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM orders ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

const port = process.env.APP_PORT || 4000;
app.listen(port, () => {
  console.log(`ERP Simulator listening on port ${port}`);
});
