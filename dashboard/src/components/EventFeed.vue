<script setup>
defineEmits(["retry"]);
defineProps({
  events: {
    type: Array,
    default: () => [],
  },
});

function formatTime(value) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleTimeString();
}
</script>

<template>
  <section class="panel">
    <h2>Live Sync Events</h2>
    <ul v-if="events.length" class="feed">
      <li v-for="event in events" :key="event.id" class="feed-item" :class="`feed-${event.status}`">
        <div class="feed-main">
          <span class="feed-type">{{ event.change_type }}</span>
          <span class="mono">{{ event.sfdc_record_id }}</span>
          <span class="feed-fields" v-if="event.changed_fields?.length">
            ({{ event.changed_fields.join(", ") }})
          </span>
        </div>
        <div class="feed-meta">
          <span class="badge" :class="`status-${event.status}`">{{ event.status }}</span>
          <span class="mono">{{ formatTime(event.created_at) }}</span>
          <span v-if="event.retry_count > 0" class="mono">retries: {{ event.retry_count }}</span>
          <button v-if="event.status === 'error'" class="retry-btn" @click="$emit('retry', event.id)">
            Retry
          </button>
        </div>
        <p v-if="event.error_message" class="error-msg">{{ event.error_message }}</p>
      </li>
    </ul>
    <p v-else class="empty">No sync events yet.</p>
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
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 420px;
  overflow-y: auto;
}
.feed-item {
  border: 1px solid #262d3d;
  border-left-width: 3px;
  border-radius: 6px;
  padding: 0.6rem 0.85rem;
  font-size: 0.85rem;
}
.feed-success { border-left-color: #4ade80; }
.feed-error { border-left-color: #f87171; }
.feed-main {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  color: #d6dae3;
}
.feed-type {
  font-weight: 600;
  color: #e7eaf0;
}
.feed-fields {
  color: #8b93a7;
  font-size: 0.78rem;
}
.feed-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.35rem;
  color: #8b93a7;
  font-size: 0.78rem;
}
.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
}
.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
}
.status-success { background: #143526; color: #4ade80; }
.status-error { background: #331a1a; color: #f87171; }
.retry-btn {
  background: #2a3550;
  border: 1px solid #3a4a6e;
  color: #cdd8f5;
  border-radius: 6px;
  padding: 0.15rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.retry-btn:hover {
  background: #34426a;
}
.error-msg {
  margin: 0.4rem 0 0;
  color: #f87171;
  font-size: 0.78rem;
}
.empty {
  color: #8b93a7;
  font-size: 0.9rem;
}
</style>
