CREATE TABLE IF NOT EXISTS sync_events (
    id SERIAL PRIMARY KEY,
    sfdc_record_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    changed_fields TEXT[],
    status TEXT NOT NULL,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_created_at ON sync_events (created_at DESC);
