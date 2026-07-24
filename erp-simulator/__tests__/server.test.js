jest.mock("../db", () => ({
  query: jest.fn()
}));

const request = require("supertest");
const pool = require("../db");
const { app } = require("../server");

beforeEach(() => {
  pool.query.mockReset();
});

describe("POST /orders", () => {
  test("creates a new order when sfdc_order_id does not exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          erp_order_id: "ERP-ORD-123",
          sfdc_order_id: "a0X000001",
          account_name: "Acme",
          status: "New",
          amount: 100
        }
      ]
    });

    const res = await request(app).post("/orders").send({
      sfdcOrderId: "a0X000001",
      accountName: "Acme",
      status: "New",
      amount: 100
    });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe("created");
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[1][0]).toMatch(/INSERT INTO orders/);
  });

  test("updates an existing order, only touching fields present in the body", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, sfdc_order_id: "a0X000001" }] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, sfdc_order_id: "a0X000001", status: "Shipped" }]
      });

    const res = await request(app).post("/orders").send({
      sfdcOrderId: "a0X000001",
      status: "Shipped"
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("updated");
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toMatch(
      /UPDATE orders SET status = \$1, updated_at = now\(\)/
    );
    expect(updateCall[1]).toEqual(["Shipped", "a0X000001"]);
  });

  test("rejects a create request missing sfdcOrderId", async () => {
    const res = await request(app).post("/orders").send({ status: "New" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sfdcOrderId is required/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("rejects creating a brand-new order with no status", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/orders").send({
      sfdcOrderId: "a0X000002"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status is required/);
  });

  test("rejects an update with no updatable fields", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).post("/orders").send({
      sfdcOrderId: "a0X000001"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No updatable fields provided/);
  });
});

describe("GET /orders", () => {
  test("excludes soft-deleted rows by default", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get("/orders");
    expect(pool.query.mock.calls[0][0]).toMatch(/deleted_at IS NULL/);
  });

  test("includes soft-deleted rows when includeDeleted=true", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get("/orders?includeDeleted=true");
    expect(pool.query.mock.calls[0][0]).not.toMatch(/deleted_at IS NULL/);
  });
});

describe("DELETE /orders/:sfdcOrderId", () => {
  test("soft-deletes an existing order", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, sfdc_order_id: "a0X000001", deleted_at: new Date() }]
    });
    const res = await request(app).delete("/orders/a0X000001");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("deleted");
  });

  test("is a safe no-op when the order does not exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/orders/does-not-exist");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("noop");
  });
});

describe("POST /inventory", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  test("creates a new inventory item", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          erp_item_id: "ERP-ITEM-1",
          product_name: "Widget",
          quantity_on_hand: 10
        }
      ]
    });

    const res = await request(app).post("/inventory").send({
      erpItemId: "ERP-ITEM-1",
      productName: "Widget",
      quantityOnHand: 10
    });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe("created");
  });

  test("rejects create when required fields are missing", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/inventory").send({
      erpItemId: "ERP-ITEM-2"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /productName and quantityOnHand are required/
    );
  });

  test("updates only the fields provided for an existing item", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, erp_item_id: "ERP-ITEM-1" }] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, erp_item_id: "ERP-ITEM-1", quantity_on_hand: 5 }]
      });

    const res = await request(app).post("/inventory").send({
      erpItemId: "ERP-ITEM-1",
      quantityOnHand: 5
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("updated");
    expect(pool.query.mock.calls[1][0]).toMatch(
      /UPDATE inventory SET quantity_on_hand = \$1/
    );
  });
});

describe("GET /health", () => {
  test("returns ok when the DB responds", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("returns 500 when the DB query fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/health");
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("error");
  });
});

describe("POST /events/:id/retry", () => {
  test("marks the event success and applies the payload on a successful retry", async () => {
    const fakeEvent = {
      id: 5,
      payload: { sfdcOrderId: "a0X000001", status: "Shipped" }
    };
    pool.query
      .mockResolvedValueOnce({ rows: [fakeEvent] })
      .mockResolvedValueOnce({ rows: [{ id: 1, sfdc_order_id: "a0X000001" }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: "Shipped" }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, status: "success" }] });

    const res = await request(app).post("/events/5/retry");
    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe("success");
  });

  test("returns 404 when the event does not exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/events/999/retry");
    expect(res.status).toBe(404);
  });

  test("marks the event error when the retried upsert fails", async () => {
    const fakeEvent = {
      id: 6,
      payload: { status: "New" }
    };
    pool.query
      .mockResolvedValueOnce({ rows: [fakeEvent] })
      .mockResolvedValueOnce({ rows: [{ id: 6, status: "error" }] });

    const res = await request(app).post("/events/6/retry");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sfdcOrderId is required/);
  });
});
