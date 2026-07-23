CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    erp_order_id TEXT UNIQUE NOT NULL,
    sfdc_order_id TEXT UNIQUE,
    account_name TEXT,
    status TEXT NOT NULL,
    amount NUMERIC(16,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    erp_item_id TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
