<script setup>
defineProps({
  orders: {
    type: Array,
    default: () => [],
  },
});

function formatAmount(value) {
  if (value === null || value === undefined) return "\u2014";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function formatTime(value) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString();
}
</script>

<template>
  <section class="panel">
    <h2>Orders</h2>
    <table v-if="orders.length">
      <thead>
        <tr>
          <th>SFDC Order Id</th>
          <th>ERP Order Id</th>
          <th>Account</th>
          <th>Status</th>
          <th>Amount</th>
          <th>Last Synced</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td class="mono">{{ order.sfdc_order_id }}</td>
          <td class="mono">{{ order.erp_order_id }}</td>
          <td>{{ order.account_name || "\u2014" }}</td>
          <td><span class="badge" :class="`status-${(order.status || '').toLowerCase()}`">{{ order.status }}</span></td>
          <td>{{ formatAmount(order.amount) }}</td>
          <td class="mono">{{ formatTime(order.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">No orders synced yet.</p>
  </section>
</template>

<style scoped>
.panel {
  background: #161b26;
  border: 1px solid #262d3d;
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
h2 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: #e7eaf0;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
th {
  text-align: left;
  color: #8b93a7;
  font-weight: 500;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #262d3d;
}
td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #1c212d;
  color: #d6dae3;
}
.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.8rem;
  color: #a8b0c2;
}
.badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: #262d3d;
  color: #cdd3e0;
}
.status-shipped { background: #143526; color: #4ade80; }
.status-processing { background: #2a2410; color: #facc15; }
.status-new { background: #16233a; color: #60a5fa; }
.status-cancelled { background: #331a1a; color: #f87171; }
.empty {
  color: #8b93a7;
  font-size: 0.9rem;
}
</style>
