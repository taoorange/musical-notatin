<template>
  <InstrumentIconBase :icon-url="iconUrl" />
</template>

<script setup lang="ts">
defineOptions({ name: 'InstrumentEnglishHornIcon' })
import InstrumentIconBase from '@/components/icons/instruments/InstrumentIconBase.vue'
import iconUrl from '@/assets/Instrument/E.H.svg'
</script>
