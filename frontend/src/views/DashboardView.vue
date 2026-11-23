<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../lib/api'
import { auth } from '../lib/auth'
import { listAccounts, platformName, type TebarAccount } from '../lib/accounts'
import type { AgentNews } from '../types'
import './dashboard.css'

interface Content {
  id: string
  title: string
  productName: string
  image: string
  status: string
  createdAt: string
  publication?: { postId?: string; status?: string; scheduledAt: string | null; accounts?: string[] }
}

const timeZone = 'Asia/Jakarta'
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
const monthFormat = new Intl.DateTimeFormat('id-ID', { timeZone, month: 'long', year: 'numeric' })
const dateFormat = new Intl.DateTimeFormat('id-ID', { timeZone, dateStyle: 'medium', timeStyle: 'short' })
const numbers = new Intl.NumberFormat('id-ID')
const dayKey = (value: string | Date) => dayFormat.format(new Date(value))
const dateLabel = (value: string | null) => value ? dateFormat.format(new Date(value)) : '—'
const today = dayKey(new Date())
const month = ref(today.slice(0, 7))
const period = ref('month')
const daysShown = ref(7)
const selectedDay = ref(today)
const items = ref<Content[]>([])
const agents = ref<AgentNews[]>([])
const accounts = ref<TebarAccount[]>([])
const stats = ref<Record<string, { status: string; count: number | null }>>({})
const contentReady = ref(false)
const agentReady = ref(false)
const busy = ref(false)
const issues = ref<string[]>([])
const canContent = auth.canAccess('content')
const canAgent = auth.canAccess('agent-news')
let request: AbortController | undefined

const status = (item: Content) => stats.value[item.id]?.status ?? item.publication?.status ?? item.status
const labels: Record<string, string> = {
  published: 'Terbit', partial: 'Terbit sebagian', scheduled: 'Terjadwal',
  publishing: 'Sedang terbit', failed: 'Gagal terbit', canceled: 'Dibatalkan',
  DRAFT: 'Draft', draft: 'Draft Tebar', REVIEW: 'Review', REJECTED: 'Ditolak', APPROVED: 'Disetujui',
}
const isPublished = (item: Content) => ['published', 'partial'].includes(status(item))
const scheduled = (item: Content) => status(item) === 'scheduled'

async function load() {
  const active = new AbortController()
  request = active
  const options = { signal: active.signal, cache: 'no-store' } as const
  busy.value = true
  issues.value = []
  const recordIssue = (message: string) => { if (!active.signal.aborted) issues.value.push(message) }
  await Promise.all([
    canAgent && api<{ agents: AgentNews[] }>('/agent-news', options)
      .then((result) => { agents.value = result.agents; agentReady.value = true })
      .catch(() => recordIssue('Agent News gagal dimuat.')),
    canContent && (auth.canAccess('accounts') || auth.canAccess('products')) && listAccounts()
      .then((result) => { accounts.value = result })
      .catch(() => recordIssue('Akun Tebar gagal dimuat.')),
    canContent && api<{ items: Content[] }>('/content', options).then(async (result) => {
      items.value = result.items
      contentReady.value = true
      const posts = result.items.filter((item) => item.publication?.postId)
      const snapshot: typeof stats.value = {}
      // ponytail: reuse Tebar's per-post read in batches until a bulk dashboard endpoint exists.
      let incomplete = false
      for (let index = 0; index < posts.length && !active.signal.aborted; index += 5) {
        const batch = await Promise.allSettled(posts.slice(index, index + 5).map(async (item) => {
          const data = await api<{ status: string; count: number | null }>(`/content/${item.id}/comments?count=1`, options)
          return [item.id, data] as const
        }))
        for (const result of batch) {
          if (result.status === 'fulfilled') snapshot[result.value[0]] = result.value[1]
          else incomplete = true
        }
      }
      if (active.signal.aborted) return
      stats.value = snapshot
      if (incomplete) recordIssue('Sebagian status Tebar memakai data tersimpan. Peringkat memakai komentar yang berhasil dimuat.')
    }).catch(() => recordIssue('Konten gagal dimuat.')),
  ])
  if (!active.signal.aborted) busy.value = false
}

onMounted(load)
onUnmounted(() => request?.abort())

const utcDate = (key: string) => new Date(`${key}T00:00:00Z`)
function shiftDay(key: string, amount: number) {
  const date = utcDate(key)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
function moveMonth(amount: number) {
  const date = utcDate(`${month.value}-01`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  month.value = date.toISOString().slice(0, 7)
  selectedDay.value = month.value === today.slice(0, 7) ? today : `${month.value}-01`
}

const monthLabel = computed(() => monthFormat.format(utcDate(`${month.value}-01`)))
const filtered = computed(() => items.value.filter(item => period.value === 'all' || dayKey(item.createdAt).startsWith(month.value)))
const latest = computed(() => [...filtered.value].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4))
const ranked = computed(() => filtered.value
  .filter(item => isPublished(item) && stats.value[item.id]?.count != null)
  .sort((a, b) => stats.value[b.id]!.count! - stats.value[a.id]!.count!).slice(0, 3))
const metrics = computed(() => [
  { label: 'Total Konten', count: filtered.value.length, icon: '▤', tone: 'cyan' },
  { label: 'Dipublikasikan', count: filtered.value.filter(isPublished).length, icon: '✓', tone: 'green' },
  { label: 'Terjadwal', count: filtered.value.filter(scheduled).length, icon: '▦', tone: 'violet' },
  { label: 'Draft', count: filtered.value.filter(item => item.status === 'DRAFT').length, icon: '✎', tone: 'amber' },
  { label: 'Ditolak', count: filtered.value.filter(item => item.status === 'REJECTED').length, icon: '×', tone: 'rose' },
])

const chart = computed(() => {
  const end = period.value === 'all' || month.value === today.slice(0, 7) ? today : shiftDay(nextMonth.value, -1)
  const counts = new Map<string, number>()
  for (const item of filtered.value) {
    const key = dayKey(item.createdAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from({ length: daysShown.value }, (_, index) => {
    const key = shiftDay(end, index - daysShown.value + 1)
    return { key, count: counts.get(key) ?? 0 }
  })
})
const chartMax = computed(() => Math.max(1, ...chart.value.map(day => day.count)))
const nextMonth = computed(() => {
  const date = utcDate(`${month.value}-01`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString().slice(0, 10)
})
const calendar = computed(() => {
  const first = `${month.value}-01`
  const offset = (utcDate(first).getUTCDay() + 6) % 7
  const weeks = Math.ceil((offset + Number(shiftDay(nextMonth.value, -1).slice(-2))) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => shiftDay(first, index - offset))
})
const schedule = computed(() => {
  const byDay: Record<string, Content[]> = {}
  for (const item of items.value) {
    const date = item.publication?.scheduledAt
    if (date && scheduled(item)) (byDay[dayKey(date)] ??= []).push(item)
  }
  for (const entries of Object.values(byDay)) entries.sort((a, b) =>
    Date.parse(a.publication!.scheduledAt!) - Date.parse(b.publication!.scheduledAt!))
  return byDay
})

const channelColors = ['#00b7d5', '#a14eed', '#1976ed', '#fa5a7b', '#eba82a', '#15a778']
const channels = computed(() => {
  const platforms = new Map(accounts.value.map(account => [account.id, account.platform]))
  const counts = new Map<string, number>()
  for (const item of filtered.value.filter(isPublished)) {
    for (const target of new Set(item.publication?.accounts ?? [])) {
      const platform = platforms.get(target) ?? 'Kanal belum terpetakan'
      counts.set(platform, (counts.get(platform) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([platform, count], index) =>
    ({ platform, count, color: channelColors[index % channelColors.length]! }))
})
const channelTotal = computed(() => channels.value.reduce((total, channel) => total + channel.count, 0))
const donut = computed(() => {
  let end = 0
  const segments = channels.value.map(channel => {
    const start = end
    end += channel.count / channelTotal.value * 100
    return `${channel.color} ${start}% ${end}%`
  })
  return segments.length ? `conic-gradient(${segments.join(',')})` : '#e7eff5'
})

const activeAgents = computed(() => agents.value.filter(agent => agent.status === 'ACTIVE'))
const nextAgent = computed(() => [...activeAgents.value].filter(agent => agent.nextRunAt)
  .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0])
const lastAgent = computed(() => [...agents.value].filter(agent => agent.lastAttemptAt)
  .sort((a, b) => Date.parse(b.lastAttemptAt!) - Date.parse(a.lastAttemptAt!))[0])
</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <div>
        <p role="heading" aria-level="2" class="dash-welcome">Selamat datang, {{ auth.user.value?.name }}</p>
        <h1>Dashboard</h1>
        <p>Pantau konten, jadwal publikasi, dan aktivitas Agent News.</p>
      </div>
      <div class="dash-controls">
        <select v-if="canContent" v-model="period" aria-label="Periode konten">
          <option value="month">Dibuat · {{ monthLabel }}</option>
          <option value="all">Semua waktu</option>
        </select>
        <button v-if="canContent || canAgent" type="button" :disabled="busy" @click="load">{{ busy ? 'Memuat…' : '↻ Perbarui' }}</button>
      </div>
    </header>

    <p v-if="issues.length" class="dash-notice" role="status">{{ issues.join(' ') }}</p>
    <p v-if="!canContent && !canAgent" class="dash-notice">Widget tersedia sesuai akses modul Anda.</p>

    <section v-if="canContent" class="dash-metrics" aria-label="Ringkasan konten">
      <article v-for="(metric, index) in metrics" :key="metric.label" class="dash-card dash-metric" :class="metric.tone" :style="{ '--delay': index * 45 + 'ms' }">
        <span class="dash-icon" aria-hidden="true">{{ metric.icon }}</span>
        <div><p>{{ metric.label }}</p><strong>{{ contentReady ? numbers.format(metric.count) : '—' }}</strong></div>
      </article>
    </section>

    <div class="dash-grid">
      <section v-if="canAgent" class="dash-card dash-agent">
        <header><h2><span aria-hidden="true">◉</span> Status AI Agent</h2><span v-if="agentReady && agents.length" class="dash-pill" :class="{ enabled: activeAgents.length }">{{ activeAgents.length }} aktif</span></header>
        <dl v-if="agentReady && agents.length">
          <div><dt>Agent terdaftar</dt><dd>{{ agents.length }}</dd></div>
          <div><dt>Eksekusi terakhir</dt><dd>{{ dateLabel(lastAgent?.lastAttemptAt ?? null) }}</dd></div>
          <div><dt>Eksekusi berikutnya</dt><dd>{{ dateLabel(nextAgent?.nextRunAt ?? null) }}</dd></div>
          <div v-if="nextAgent"><dt>Agent berikutnya</dt><dd>{{ nextAgent.name }}</dd></div>
          <div v-if="nextAgent"><dt>Jam operasional</dt><dd>{{ nextAgent.startTime }}–{{ nextAgent.endTime }} · {{ nextAgent.timezone }}</dd></div>
          <div v-if="nextAgent"><dt>Frekuensi</dt><dd>{{ nextAgent.frequencyMinutes }} menit</dd></div>
        </dl>
        <p v-else class="dash-empty">{{ busy ? 'Memuat agent…' : agentReady ? 'Belum ada Agent News.' : 'Data agent tidak tersedia.' }}</p>
        <RouterLink class="dash-outline" to="/agent-news">Kelola Agent News <span aria-hidden="true">→</span></RouterLink>
      </section>

      <section v-if="canContent" class="dash-card dash-performance">
        <header><h2><span aria-hidden="true">▥</span> Aktivitas Konten</h2>
          <select v-model.number="daysShown" aria-label="Rentang grafik"><option :value="7">7 hari</option><option :value="14">14 hari</option></select>
        </header>
        <p class="dash-caption">Konten dibuat per hari · WIB</p>
        <div v-if="contentReady && chart.some(day => day.count)" class="dash-chart">
          <div v-for="day in chart" :key="day.key" class="dash-column">
            <div class="dash-column-track">
              <div class="dash-bar" :style="{ '--height': day.count / chartMax * 100 + '%' }" role="img" :aria-label="`${day.key}, ${day.count} konten`">
                <span>{{ day.count }}</span>
              </div>
            </div>
            <small>{{ Number(day.key.slice(-2)) }}</small>
          </div>
        </div>
        <p v-else class="dash-empty">{{ busy && !contentReady ? 'Memuat aktivitas…' : contentReady ? 'Belum ada konten di rentang grafik.' : 'Aktivitas tidak tersedia.' }}</p>
      </section>

      <section v-if="canContent" class="dash-card dash-channels">
        <header><h2><span aria-hidden="true">◈</span> Ringkasan Omnichannel</h2></header>
        <p class="dash-caption">Target akun pada konten terbit, termasuk terbit sebagian</p>
        <div v-if="channels.length" class="dash-channel-body">
          <div class="dash-donut" :style="{ '--donut': donut }"><div><strong>{{ numbers.format(channelTotal) }}</strong><small>target</small></div></div>
          <ul class="dash-legend">
            <li v-for="channel in channels" :key="channel.platform">
              <i :style="{ background: channel.color }" aria-hidden="true"></i><span>{{ platformName(channel.platform) }}</span>
              <strong>{{ numbers.format(channel.count) }}</strong>
            </li>
          </ul>
        </div>
        <p v-else class="dash-empty">{{ busy ? 'Memuat kanal…' : contentReady ? 'Belum ada target publikasi tercatat.' : 'Data kanal tidak tersedia.' }}</p>
      </section>

      <section v-if="canContent" id="kalender-publikasi" class="dash-card dash-calendar">
        <header><h2><span aria-hidden="true">▦</span> Kalender Publikasi</h2></header>
        <div class="dash-month">
          <button type="button" aria-label="Bulan sebelumnya" @click="moveMonth(-1)">‹</button>
          <strong aria-live="polite">{{ monthLabel }}</strong>
          <button type="button" aria-label="Bulan berikutnya" @click="moveMonth(1)">›</button>
        </div>
        <div class="dash-days">
          <span v-for="day in ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']" :key="day">{{ day }}</span>
          <button v-for="day in calendar" :key="day" type="button"
            :class="{ outside: !day.startsWith(month), today: day === today }"
            :aria-label="`${day}, ${schedule[day]?.length ?? 0} jadwal`"
            :aria-pressed="day === selectedDay" :aria-current="day === today ? 'date' : undefined"
            @click="selectedDay = day">
            {{ Number(day.slice(-2)) }}<i v-if="schedule[day]?.length" aria-hidden="true"></i>
          </button>
        </div>
        <ul v-if="schedule[selectedDay]?.length" class="dash-agenda" aria-live="polite">
          <li v-for="item in schedule[selectedDay]" :key="item.id">
            <RouterLink :to="{ path: '/content', query: { detail: item.id } }">{{ item.title }}</RouterLink>
            <small>{{ dateLabel(item.publication?.scheduledAt ?? null) }} WIB</small>
          </li>
        </ul>
        <p v-else class="dash-caption dash-no-agenda" aria-live="polite">{{ contentReady ? 'Tidak ada jadwal pada tanggal ini.' : 'Jadwal belum tersedia.' }}</p>
      </section>

      <section v-if="canContent" class="dash-card dash-latest">
        <header><h2><span aria-hidden="true">▤</span> Konten Terbaru</h2><RouterLink to="/content">Lihat semua →</RouterLink></header>
        <ul v-if="latest.length" class="dash-list">
          <li v-for="item in latest" :key="item.id">
            <RouterLink :to="{ path: '/content', query: { detail: item.id } }">
              <img v-if="item.image" :src="item.image" alt="" loading="lazy"><span v-else class="dash-placeholder" aria-hidden="true">▤</span>
              <span class="dash-item-title"><strong>{{ item.title }}</strong><small>{{ item.productName }}</small></span>
              <span class="dash-item-meta"><span class="dash-pill" :data-status="status(item)">{{ labels[status(item)] ?? status(item) }}</span><small>{{ dateLabel(item.createdAt) }}</small></span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="dash-empty">{{ busy ? 'Memuat konten…' : contentReady ? 'Belum ada konten di periode ini.' : 'Konten tidak tersedia.' }}</p>
      </section>

      <div class="dash-side">
        <section v-if="canContent" class="dash-card dash-ranking">
          <header><h2><span aria-hidden="true">✦</span> Konten Teratas</h2></header>
          <p class="dash-caption">Berdasarkan komentar tersinkron</p>
          <ol v-if="ranked.length" class="dash-list">
            <li v-for="(item, index) in ranked" :key="item.id">
              <RouterLink :to="{ path: '/content', query: { detail: item.id } }">
                <span class="dash-rank">{{ index + 1 }}</span>
                <span class="dash-item-title"><strong>{{ item.title }}</strong><small>{{ item.productName }}</small></span>
                <strong>{{ numbers.format(stats[item.id]?.count ?? 0) }}</strong>
              </RouterLink>
            </li>
          </ol>
          <p v-else class="dash-empty">{{ busy ? 'Memuat komentar…' : 'Belum ada data komentar untuk periode ini.' }}</p>
        </section>

        <section class="dash-card dash-actions">
          <header><h2><span aria-hidden="true">ϟ</span> Aksi Cepat</h2></header>
          <div>
            <RouterLink v-if="canContent && auth.isAdmin.value" to="/content/new"><span aria-hidden="true">＋</span>Buat konten</RouterLink>
            <a v-if="canContent" href="#kalender-publikasi"><span aria-hidden="true">▦</span>Jadwal</a>
            <RouterLink v-if="canAgent" to="/agent-news"><span aria-hidden="true">◉</span>Agent News</RouterLink>
            <RouterLink v-if="auth.canAccess('settings')" to="/settings"><span aria-hidden="true">⚙</span>Pengaturan</RouterLink>
            <RouterLink v-if="!canContent && !canAgent" to="/profile"><span aria-hidden="true">◎</span>Profil</RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
