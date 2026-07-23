<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import MetricTiles from "./components/MetricTiles.vue";
import OrdersTable from "./components/OrdersTable.vue";
import EventFeed from "./components/EventFeed.vue";
import { getOrders, getEvents, getMetrics, retryEvent } from "./api";

const orders = ref([]);
const events = ref([]);
const metrics = ref({});
const lastRefreshed = ref(null);
let intervalId = null;

async function refresh() {
  try {
    const [ordersData, eventsData, metricsData] = await Promise.all([
      getOrders(),
      getEvents(),
      getMetrics(),
    ]);
    orders.value = ordersData;
    events.value = eventsData;
    metrics.value = metricsData;
    lastRefreshed.value = new Date();
  } catch (err) {
    console.error("Refresh failed:", err.message);
  }
}

async function handleRetry(id) {
  try {
    await retryEvent(id);
    await refresh();
  } catch (err) {
    console.error("Retry failed:", err.message);
  }
}

onMounted(() => {
  refresh();
  intervalId = setInterval(refresh, 4000);
});

onUnmounted(() => {
  clearInterval(intervalId);
});
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>SFDC-ERP-Sync <span>Ops Dashboard</span></h1>
      <p class="subtitle">
        Live view of the Salesforce CDC &rarr; ERP Simulator sync pipeline
        <span v-if="lastRefreshed" class="mono">
          &middot; refreshed {{ lastRefreshed.toLocaleTimeString() }}
        </span>
      </p>
    </header>

    <MetricTiles :metrics="metrics" />
    <EventFeed :events="events" @retry="handleRetry" />
    <OrdersTable :orders="orders" />
  </div>
</template>

<style scoped>
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
.app-header {
  margin-bottom: 1.5rem;
}
h1 {
  font-size: 1.5rem;
  color: #e7eaf0;
  margin: 0 0 0.35rem;
}
h1 span {
  color: #60a5fa;
  font-weight: 400;
}
.subtitle {
  color: #8b93a7;
  font-size: 0.9rem;
  margin: 0;
}
.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
}
</style>
