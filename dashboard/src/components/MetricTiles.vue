<script setup>
defineProps({
  metrics: {
    type: Object,
    default: () => ({ events_today: 0, errors_today: 0, success_today: 0, last_event_at: null }),
  },
});

function formatTime(value) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleTimeString();
}
</script>

<template>
  <div class="tiles">
    <div class="tile">
      <span class="tile-label">Events Today</span>
      <span class="tile-value">{{ metrics.events_today ?? 0 }}</span>
    </div>
    <div class="tile tile-success">
      <span class="tile-label">Successful</span>
      <span class="tile-value">{{ metrics.success_today ?? 0 }}</span>
    </div>
    <div class="tile tile-error">
      <span class="tile-label">Errors</span>
      <span class="tile-value">{{ metrics.errors_today ?? 0 }}</span>
    </div>
    <div class="tile">
      <span class="tile-label">Last Sync</span>
      <span class="tile-value tile-value-sm">{{ formatTime(metrics.last_event_at) }}</span>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.tile {
  background: #161b26;
  border: 1px solid #262d3d;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tile-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b93a7;
}
.tile-value {
  font-size: 1.9rem;
  font-weight: 600;
  color: #e7eaf0;
}
.tile-value-sm {
  font-size: 1.1rem;
}
.tile-success .tile-value { color: #4ade80; }
.tile-error .tile-value { color: #f87171; }
</style>
