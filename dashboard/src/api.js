const BASE_URL = "http://localhost:4000";

export async function getOrders() {
  const res = await fetch(`${BASE_URL}/orders`);
  if (!res.ok) throw new Error("Failed to load orders");
  return res.json();
}

export async function getEvents() {
  const res = await fetch(`${BASE_URL}/events?limit=50`);
  if (!res.ok) throw new Error("Failed to load events");
  return res.json();
}

export async function getMetrics() {
  const res = await fetch(`${BASE_URL}/metrics`);
  if (!res.ok) throw new Error("Failed to load metrics");
  return res.json();
}

export async function retryEvent(id) {
  const res = await fetch(`${BASE_URL}/events/${id}/retry`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Retry failed");
  return data;
}
