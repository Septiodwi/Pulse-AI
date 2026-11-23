<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { auth } from '../lib/auth'
import type { AgentNews, AgentNewsContent, AgentNewsExecution, AgentNewsSourceRun } from '../types'

const route=useRoute(),router=useRouter(),agent=ref<AgentNews|null>(null),executions=ref<AgentNewsExecution[]>([]),sourceRuns=ref<AgentNewsSourceRun[]>([]),contents=ref<AgentNewsContent[]>([]),loading=ref(true),search=ref(''),recommendation=ref('')
const activeTab=computed(()=>(route.query.tab==='history'?'history':'monitoring'))
const selectedRun = computed(() => executions.value.find((item) => item.id === route.query.executionId) ?? executions.value[0])
const monitoring = computed(() => contents.value.filter((item) => item.executionId === selectedRun.value?.id))
const generating = ref('')
const generationError = ref('')
const recommendedCount = (id: string) => contents.value.filter((item) => item.executionId === id && item.recommendation === 'RECOMMENDED').length

async function generate(execution: AgentNewsExecution) {
  generating.value = execution.id
  generationError.value = ''
  try {
    const result = await api<{ ids: string[] }>(`/agent-news/${execution.agentId}/executions/${execution.id}/content`, { method: 'POST' })
    await router.push({ path: '/content', query: { executionId: execution.id, ...(result.ids.length === 1 ? { detail: result.ids[0] } : {}) } })
  } catch (cause) {
    generationError.value = (cause as Error).message
  } finally {
    generating.value = ''
  }
}

const filteredContents=computed(()=>monitoring.value.filter(item=>(!search.value||[item.author??'',item.text??'',item.searchTerm??''].some(value=>value.toLowerCase().includes(search.value.toLowerCase())))&&(!recommendation.value||item.recommendation===recommendation.value)))
const fmt=(value:string|null)=>value?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value)):'-'
const runsFor=(executionId:string)=>sourceRuns.value.filter(run=>run.executionId===executionId)
function note(executionId:string){const runs=runsFor(executionId);return runs.length&&runs.every(run=>run.status==='SUCCESS')&&runs.reduce((sum,run)=>sum+run.newItemsCount,0)===0?'Berhasil, tidak ada posting baru dalam rentang waktu agent.':''}
async function load(){loading.value=true;try{const id=String(route.params.id);const [agentData,history,data]=await Promise.all([api<{agent:AgentNews}>(`/agent-news/${id}`),api<{executions:AgentNewsExecution[];sourceRuns:AgentNewsSourceRun[]}>(`/agent-news/executions?agentId=${id}`),api<{contents:AgentNewsContent[]}>(`/agent-news/contents?agentId=${id}`)]);agent.value=agentData.agent;executions.value=history.executions;sourceRuns.value=history.sourceRuns.filter(run=>history.executions.some(item=>item.id===run.executionId));contents.value=data.contents}finally{loading.value=false}}
function selectTab(tab: 'monitoring' | 'history', executionId = selectedRun.value?.id) { void router.replace({ query: { tab, executionId } }) }
watch(()=>route.params.id,load)
onMounted(load)
</script>

<template>
  <section class="detail-page">
    <button class="back-link" type="button" @click="router.push('/agent-news')">← Kembali ke Daftar Agent</button>
    <header v-if="agent" class="detail-header"><div><small>AI Content Intelligence</small><h1>{{agent.name}}</h1><p>{{agent.description}}</p></div><span :class="['agent-status',agent.status.toLowerCase()]">{{agent.status==='ACTIVE'?'Aktif':'Nonaktif'}}</span></header>
    <nav class="detail-tabs"><button :class="{active:activeTab==='monitoring'}" @click="selectTab('monitoring')">Data Monitoring <b>{{monitoring.length}}</b></button><button :class="{active:activeTab==='history'}" @click="selectTab('history')">Riwayat Pengambilan <b>{{executions.length}}</b></button></nav>
    <p v-if="loading" class="empty">Memuat data agent…</p>
    <main v-else-if="activeTab==='monitoring'" class="detail-panel"><div class="run-picker">
      <label for="monitoring-run">Riwayat pengambilan</label>
      <select v-if="executions.length" id="monitoring-run" :value="selectedRun?.id" @change="selectTab('monitoring', ($event.target as HTMLSelectElement).value)">
        <option v-for="run in executions" :key="run.id" :value="run.id">{{ fmt(run.startedAt ?? run.createdAt) }} · {{ run.triggerType === 'MANUAL' ? 'Get Now' : 'Terjadwal' }} · {{ recommendedCount(run.id) }} rekomendasi</option>
      </select>
      <span v-if="selectedRun">{{ monitoring.length }} posting · {{ recommendedCount(selectedRun.id) }} rekomendasi</span>
    </div><div class="filters"><input v-model="search" aria-label="Cari data monitoring" placeholder="Cari konten, author, atau keyword…"/><select v-model="recommendation" aria-label="Filter rekomendasi"><option value="">Semua Analisis</option><option value="RECOMMENDED">Rekomendasi</option><option value="NOT_RECOMMENDED">Not Rekomendasi</option><option value="PENDING">Menunggu Analisis</option><option value="FAILED">Analisis Gagal</option></select></div><div class="content-grid"><article v-for="item in filteredContents" :key="item.id"><img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" alt="Thumbnail konten"/><div class="meta"><span>{{item.platform}}</span><strong :class="item.recommendation.toLowerCase().replace('_','-')">{{item.recommendation==='RECOMMENDED'?'REKOMENDASI':item.recommendation==='NOT_RECOMMENDED'?'NOT REKOMENDASI':item.recommendation==='FAILED'?'ANALISIS GAGAL':'MENUNGGU'}}</strong></div><h3>{{item.author||'Author tidak tersedia'}}</h3><p>{{item.text||'-'}}</p><aside v-if="item.analysisReason"><b>Analisis AI <span v-if="item.relevanceScore!==null">{{item.relevanceScore}}/100</span></b><p>{{item.analysisReason}}</p></aside><small>{{item.searchTerm||'-'}} · {{fmt(item.publishedAt)}}</small><a v-if="item.postUrl" :href="item.postUrl" target="_blank" rel="noopener">Lihat posting asli ↗</a></article></div><p v-if="!filteredContents.length" class="empty">Belum ada posting baru dalam rentang waktu agent ini.</p></main>
    <main v-else class="detail-panel history-list"><p v-if="generationError" class="error" role="alert">{{ generationError }}</p><article v-for="execution in executions" :key="execution.id" class="execution"><header><div><b>{{execution.triggerType==='MANUAL'?'Get Now':'Terjadwal'}}</b><small>{{fmt(execution.startedAt)}} · {{execution.id}}</small></div><span :class="['run-status',execution.status.toLowerCase()]">{{execution.status}}</span></header><p v-if="execution.errorMessage" class="error">{{execution.errorMessage}}</p><p v-else-if="note(execution.id)" class="notice">{{note(execution.id)}}</p><div class="run-actions">
      <button @click="selectTab('monitoring', execution.id)">Lihat Monitoring ({{ recommendedCount(execution.id) }} rekomendasi)</button>
      <button v-if="auth.isAdmin.value" :disabled="Boolean(generating) || !['SUCCESS', 'PARTIAL_SUCCESS'].includes(execution.status) || !recommendedCount(execution.id)" @click="generate(execution)">{{ generating === execution.id ? 'Sedang generate…' : 'Generate Konten' }}</button>
      <span v-if="generating === execution.id" role="status">Menyiapkan gambar dan caption…</span>
    </div><div class="table-scroll"><table><thead><tr><th>Platform</th><th>Actor Run ID</th><th>Dataset ID</th><th>Status</th><th>Hasil</th><th>Baru</th><th>Duplikat</th><th>Error</th></tr></thead><tbody><tr v-for="run in runsFor(execution.id)" :key="run.id"><td>{{run.platform}}</td><td><code>{{run.apifyRunId||'-'}}</code></td><td><code>{{run.datasetId||'-'}}</code></td><td>{{run.status}}</td><td>{{run.resultsCount}}</td><td>{{run.newItemsCount}}</td><td>{{run.duplicateItemsCount}}</td><td class="error">{{run.errorMessage||'-'}}</td></tr></tbody></table></div></article><p v-if="!executions.length" class="empty">Belum ada riwayat pengambilan data.</p></main>
  </section>
</template>

<style scoped>
.detail-page{color:#0b2036}.back-link{margin-bottom:16px;padding:0;color:#078da1;border:0;background:transparent;font-weight:850;cursor:pointer}.detail-header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:23px;border:1px solid #d0e9ef;border-radius:21px;background:linear-gradient(120deg,#fff,#eafcff)}.detail-header small{color:#078da1;font-weight:900}.detail-header h1{margin:4px 0;font-size:clamp(2rem,4vw,3rem)}.detail-header p{margin:0;color:#5e7483}.agent-status,.run-status{padding:7px 11px;border-radius:999px;font-size:.75rem;font-weight:900}.agent-status.active,.run-status.success{color:#087b55;background:#ddf7e9}.agent-status.paused,.run-status.failed{color:#b52d39;background:#ffe2e6}.run-status.running,.run-status.queued{color:#8c610e;background:#fff0c8}.detail-tabs{display:flex;gap:8px;margin:20px 0 14px;border-bottom:1px solid #d4e7ec}.detail-tabs button{padding:13px 17px;border:0;border-bottom:3px solid transparent;background:transparent;font-weight:900;cursor:pointer}.detail-tabs button.active{color:#0793a7;border-color:#08b8cd}.detail-tabs b{margin-left:5px;padding:3px 7px;border-radius:999px;background:#e5f8fb}.detail-panel{padding:18px;border:1px solid #d0e8ed;border-radius:19px;background:white}.filters{display:flex;gap:10px;margin-bottom:16px}.filters input{flex:1}.filters select{min-width:min(100%,180px);padding:0 38px 0 13px;border:1px solid #c9e3e9;border-radius:11px;background:white}.content-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.content-grid article{padding:15px;border:1px solid #d4e8ed;border-radius:15px}.content-grid img{width:100%;height:170px;object-fit:cover;border-radius:10px}.meta{display:flex;align-items:center;justify-content:space-between;margin-top:9px}.meta>span{color:#087f91;font-size:.72rem;font-weight:900}.meta strong{padding:5px 8px;border-radius:999px;font-size:.63rem}.meta .recommended{color:#087b55;background:#ddf7e9}.meta .not-recommended,.meta .failed{color:#b52d39;background:#ffe2e6}.meta .pending{color:#8c610e;background:#fff0c8}.content-grid article>p{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:4}.content-grid aside{margin:10px 0;padding:10px;border-radius:10px;background:#eefafd}.content-grid aside b{display:flex;justify-content:space-between}.content-grid aside p{margin:5px 0;color:#536d7c;font-size:.78rem}.content-grid a{display:block;margin-top:10px;color:#078da1;font-weight:850}.history-list{display:grid;gap:13px}.execution{overflow:hidden;border:1px solid #d5e8ed;border-radius:14px}.execution>header{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;background:#f0fbfd}.execution>header div{display:grid;gap:3px}.execution>header small{color:#687f8c}.table-scroll{overflow:auto}table{min-width:930px}th{background:#def7fa}.notice,.error{margin:10px 14px;padding:9px;border-radius:9px}.notice{color:#76520b;background:#fff2cd}.error{color:#b52d39}.empty{padding:50px;text-align:center;color:#718793}@media(max-width:900px){.content-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.detail-header{align-items:flex-start;flex-direction:column}.content-grid{grid-template-columns:1fr}.filters{flex-direction:column}.filters select{min-height:44px}.detail-tabs{overflow:auto}.detail-tabs button{min-width:max-content}}
.run-picker,.run-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px}.run-picker{margin-bottom:14px;background:#eaf9fc;border-radius:12px}.run-picker label{font-weight:800}.run-picker select,.run-actions button{border:1px solid #b8dce5;background:#fff;color:#123a48;border-radius:9px;padding:8px 11px}.run-actions button{cursor:pointer;font-weight:750}.run-actions button:disabled{opacity:.5;cursor:default}.run-picker span,.run-actions span{color:#476474;font-size:.85rem}
</style>
