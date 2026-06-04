<template>
  <img class="instrument-icon-base" :src="iconUrl" alt="" aria-hidden="true" />
</template>

<script setup lang="ts">
defineProps<{
  iconUrl: string
}>()
</script>

<style scoped>
.instrument-icon-base {
  width: 14px;
  height: 14px;
  display: inline-flex;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
