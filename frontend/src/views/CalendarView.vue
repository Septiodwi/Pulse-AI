<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../lib/api'
import { auth } from '../lib/auth'
import { platformLogo, platformName } from '../lib/accounts'

interface Entry {
  id: string
  title: string
  caption: string | null
  productId: string
  productName: string
  at: string
  status: string
  platforms: string[]
  confirmed: boolean
  scheduled: boolean
}

const timezone = 'Asia/Jakarta'
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone })
const clock = new Intl.DateTimeFormat('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
const month = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const fullDate = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const key = (date: Date) => date.toISOString().slice(0, 10)
const dayMs = 86_400_000
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayMs)
const monday = (date: Date) => addDays(date, -((date.getUTCDay() + 6) % 7))
const monthStart = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
const today = ref(dateKey.format(new Date()))
const anchor = ref(new Date(today.value))
const mode = ref<'month' | 'week' | 'agenda'>(window.matchMedia('(max-width: 700px)').matches ? 'agenda' : 'month')
const items = ref<Entry[]>([])
const selected = ref<Entry>()
const detailDialog = ref<HTMLDialogElement>()
const detailDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: timezone, dateStyle: 'full', timeStyle: 'short',
})

interface Comment {
  id: string
  text: string | null
  author_username: string | null
  commented_at: string
}

const images = ref<string[]>([])
const imageIndex = ref(0)
const imageStatus = ref('')
const comments = ref<Comment[]>([])
const commentsLoading = ref(false)
const commentsError = ref('')
const commentsAvailable = ref(false)
const nextCursor = ref<string | null>(null)
let detailRequest: AbortController | undefined

function closeDetails() {
  detailRequest?.abort()
  selected.value = undefined
}
onBeforeUnmount(closeDetails)

async function openDetails(item: Entry) {
  detailRequest?.abort()
  const request = new AbortController()
  detailRequest = request
  selected.value = item
  images.value = []
  imageIndex.value = 0
  imageStatus.value = 'Memuat gambar…'
  comments.value = []
  nextCursor.value = null
  commentsError.value = ''
  commentsAvailable.value = false
  commentsLoading.value = false
  await nextTick()
  detailDialog.value?.showModal()
  void readComments()
  try {
    const data = await api<{ images: string[] }>(`/content/${item.id}/calendar-images`, { signal: request.signal })
    if (request.signal.aborted) return
    images.value = data.images
    imageStatus.value = data.images.length ? '' : 'Gambar belum tersedia.'
  } catch {
    if (!request.signal.aborted) imageStatus.value = 'Gambar gagal dimuat.'
  }
}

async function readComments(cursor?: string) {
  const item = selected.value
  const request = detailRequest
  if (!item || !request || commentsLoading.value) return
  if (item.confirmed && !['published', 'partial'].includes(item.status)) return
  commentsLoading.value = true
  commentsError.value = ''
  try {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const data = await api<{ status: string; comments: Comment[]; nextCursor: string | null }>(
      `/content/${item.id}/comments${query}`, { signal: request.signal, cache: 'no-store' },
    )
    if (request.signal.aborted) return
    commentsAvailable.value = ['published', 'partial'].includes(data.status)
    comments.value = cursor ? [...comments.value, ...data.comments] : data.comments
    nextCursor.value = data.nextCursor
  } catch {
    if (!request.signal.aborted) commentsError.value = 'Komentar gagal dimuat dari Tebar.'
  } finally {
    if (!request.signal.aborted) commentsLoading.value = false
  }
}
const product = ref('')
const platform = ref('')
const status = ref('')
const search = ref('')
const loading = ref(true)
const error = ref('')
const revision = ref(0)
const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const labels: Record<string, string> = {
  scheduled: 'Terjadwal', published: 'Sudah terbit', partial: 'Terbit sebagian',
  publishing: 'Sedang terbit', failed: 'Gagal', canceled: 'Dibatalkan',
  draft: 'Draft di Tebar', unknown: 'Perlu diperiksa',
}
const state = (item: Entry) => item.confirmed && Object.hasOwn(labels, item.status) ? item.status : 'unknown'
const start = computed(() => monday(mode.value === 'week' ? anchor.value : monthStart(anchor.value)))
const end = computed(() => mode.value === 'week' ? addDays(start.value, 7)
  : addDays(monday(addDays(monthStart(anchor.value, 1), -1)), 7))
const period = computed(() => mode.value === 'week'
  ? `${fullDate.format(start.value)} – ${fullDate.format(addDays(end.value, -1))}`
  : month.format(anchor.value))
const range = computed(() => new URLSearchParams({
  from: new Date(`${key(mode.value === 'week' ? start.value : monthStart(anchor.value))}T00:00:00+07:00`).toISOString(),
  to: new Date(`${key(mode.value === 'week' ? end.value : monthStart(anchor.value, 1))}T00:00:00+07:00`).toISOString(),
}).toString())

watch([range, revision], async ([query], previous, cleanup) => {
  const request = new AbortController()
  cleanup(() => request.abort())
  if (query !== previous?.[0]) items.value = []
  loading.value = true
  error.value = ''
  try {
    const result = await api<{ items: Entry[] }>(`/content/calendar?${query}`, { signal: request.signal })
    if (!request.signal.aborted) items.value = result.items
  } catch (cause) {
    if (!request.signal.aborted) error.value = (cause as Error).message
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}, { immediate: true })

const products = computed(() => [...new Map(items.value.map((item) => [item.productId, item.productName]))])
const platforms = computed(() => [...new Set(items.value.flatMap((item) => item.platforms))].sort())
const visible = computed(() => items.value.filter((item) =>
  (!product.value || product.value === item.productId) &&
  (!platform.value || item.platforms.includes(platform.value)) &&
  (!status.value || status.value === state(item)) &&
  `${item.title} ${item.productName}`.toLowerCase().includes(search.value.trim().toLowerCase()),
))
const counts = computed(() => [
  ['scheduled', items.value.filter((item) => state(item) === 'scheduled').length],
  ['published', items.value.filter((item) => state(item) === 'published').length],
  ['attention', items.value.filter((item) => ['unknown', 'failed', 'partial'].includes(state(item))).length],
] as const)
const days = computed(() => {
  const grouped = new Map<string, Entry[]>()
  for (const item of visible.value) {
    const date = dateKey.format(new Date(item.at))
    const entries = grouped.get(date) ?? []
    entries.push(item)
    grouped.set(date, entries)
  }
  return Array.from({ length: (end.value.getTime() - start.value.getTime()) / dayMs }, (_, index) => {
    const date = addDays(start.value, index)
    return { key: key(date), date, entries: grouped.get(key(date)) ?? [] }
  })
})
const shownDays = computed(() => mode.value === 'agenda' ? days.value.filter((day) => day.entries.length) : days.value)

function move(direction: number) {
  anchor.value = mode.value === 'week' ? addDays(anchor.value, direction * 7) : monthStart(anchor.value, direction)
}

function goToday() {
  today.value = dateKey.format(new Date())
  anchor.value = new Date(today.value)
}
</script>

<template>
  <section class="calendar">
    <header class="heading">
      <div>
        <h1>Kalender Konten</h1>
        <p>Pantau jadwal unggah dan status publikasi media sosial.</p>
      </div>
      <RouterLink class="action" :to="auth.isAdmin.value ? '/content/new' : '/content'">
        {{ auth.isAdmin.value ? '+ Buat Konten' : 'Buka Konten Generator' }}
      </RouterLink>
    </header>

    <div class="summary" aria-label="Ringkasan periode kalender">
      <article v-for="[name, count] in counts" :key="name" :data-state="name">
        <span>{{ name === 'attention' ? 'Perlu perhatian' : labels[name] }}</span>
        <strong>{{ loading || error ? '–' : count }}</strong>
      </article>
    </div>

    <div class="board" :aria-busy="loading">
      <div class="toolbar">
        <div class="period">
          <button type="button" aria-label="Periode sebelumnya" @click="move(-1)">‹</button>
          <button type="button" aria-label="Periode berikutnya" @click="move(1)">›</button>
          <button type="button" @click="goToday">Hari ini</button>
          <h2>{{ period }}</h2>
        </div>
        <div class="view-options" aria-label="Tampilan kalender">
          <button v-for="option in [{ id: 'month', label: 'Bulan' }, { id: 'week', label: 'Minggu' }, { id: 'agenda', label: 'Agenda' }] as const"
            :key="option.id" type="button" :aria-pressed="mode === option.id" @click="mode = option.id">{{ option.label }}</button>
        </div>
      </div>
      <div class="filters">
        <input v-model="search" type="search" aria-label="Cari konten" placeholder="Cari judul atau produk" />
        <select v-model="product" aria-label="Produk">
          <option value="">Semua produk</option>
          <option v-if="product && !products.some(([id]) => id === product)" :value="product">Produk terpilih</option>
          <option v-for="[id, name] in products" :key="id" :value="id">{{ name }}</option>
        </select>
        <select v-model="platform" aria-label="Platform">
          <option value="">Semua platform</option>
          <option v-if="platform && !platforms.includes(platform)" :value="platform">{{ platformName(platform) }}</option>
          <option v-for="name in platforms" :key="name" :value="name">{{ platformName(name) }}</option>
        </select>
        <select v-model="status" aria-label="Status">
          <option value="">Semua status</option>
          <option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option>
        </select>
        <button type="button" :disabled="loading" @click="revision++">Segarkan</button>
        <span class="zone">WIB · UTC+7</span>
      </div>
      <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="feedback" role="status">Memuat kalender…</p>
      <p v-else-if="!visible.length" class="feedback" role="status">
        {{ items.length ? 'Tidak ada konten yang cocok dengan filter.' : 'Belum ada jadwal publikasi untuk periode ini.' }}
      </p>

      <div v-if="!error && (mode !== 'agenda' || visible.length)" class="calendar-scroll">
        <div :class="mode === 'agenda' ? 'agenda' : 'grid'" :data-mode="mode">
          <div v-for="day in mode === 'agenda' ? [] : weekdays" :key="day" class="weekday">{{ day }}</div>
          <section v-for="day in shownDays" :key="day.key" class="day"
            :class="{ today: day.key === today, outside: mode !== 'week' && day.date.getUTCMonth() !== anchor.getUTCMonth() }"
            :aria-label="fullDate.format(day.date)">
            <h3 :aria-current="day.key === today ? 'date' : undefined">
              {{ mode === 'agenda' ? fullDate.format(day.date) : day.date.getUTCDate() }}
            </h3>
            <div v-if="day.entries.length" class="entries">
              <button v-for="item in day.entries" :key="item.id" type="button" class="entry" :data-state="state(item)"
                aria-haspopup="dialog" @click="openDetails(item)">
                <span class="meta">
                  <time :datetime="item.at">{{ clock.format(new Date(item.at)) }}</time>
                  <span class="platforms">
                    <template v-for="name in item.platforms" :key="name">
                      <img v-if="platformLogo(name)" :src="platformLogo(name)" :alt="platformName(name)" :title="platformName(name)" />
                      <span v-else>{{ platformName(name) }}</span>
                    </template>
                  </span>
                </span>
                <strong class="entry-title">{{ item.title }}</strong>
                <span class="product">{{ item.productName }}</span>
                <span class="state">{{ labels[state(item)] }}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
      <footer>Waktu mengikuti jadwal atau waktu persetujuan untuk konten yang langsung dikirim.</footer>
    </div>

    <dialog ref="detailDialog" class="schedule-dialog" aria-labelledby="schedule-title" @close="closeDetails">
      <div v-if="selected" class="schedule-detail" :data-state="state(selected)">
        <header>
          <div>
            <span class="schedule-status">{{ labels[state(selected)] }}</span>
            <h2 id="schedule-title">{{ selected.title }}</h2>
          </div>
          <form method="dialog">
            <button type="submit" class="close-detail" aria-label="Tutup detail jadwal" autofocus>×</button>
          </form>
        </header>
        <dl>
          <div>
            <dt>{{ selected.scheduled ? 'Jadwal unggah' : 'Waktu persetujuan' }}</dt>
            <dd><time :datetime="selected.at">{{ detailDate.format(new Date(selected.at)) }} WIB</time></dd>
          </div>
          <div><dt>Produk</dt><dd>{{ selected.productName }}</dd></div>
          <div>
            <dt>Platform</dt>
            <dd class="detail-platforms">
              <span v-for="name in selected.platforms" :key="name">
                <img v-if="platformLogo(name)" :src="platformLogo(name)" alt="" />
                {{ platformName(name) }}
              </span>
              <span v-if="!selected.platforms.length">Platform tidak tersedia</span>
            </dd>
          </div>
        </dl>
        <section class="schedule-caption schedule-media">
          <h3>Gambar</h3>
          <p v-if="imageStatus" role="status">{{ imageStatus }}</p>
          <template v-else-if="images.length">
            <img :src="images[imageIndex]" :alt="`${selected.title} · Gambar ${imageIndex + 1}`" />
            <div v-if="images.length > 1" class="media-controls">
              <button type="button" :disabled="imageIndex === 0" @click="imageIndex--">Sebelumnya</button>
              <span aria-live="polite">{{ imageIndex + 1 }} / {{ images.length }}</span>
              <button type="button" :disabled="imageIndex === images.length - 1" @click="imageIndex++">Berikutnya</button>
            </div>
          </template>
        </section>
        <section v-if="selected.caption" class="schedule-caption">
          <h3>Caption</h3>
          <p>{{ selected.caption }}</p>
        </section>
        <section class="schedule-caption schedule-comments">
          <h3>Komentar</h3>
          <p v-if="commentsLoading" role="status">Memuat komentar…</p>
          <p v-else-if="commentsError" role="alert">{{ commentsError }}</p>
          <p v-else-if="!commentsAvailable">Komentar tersedia setelah konten terbit.</p>
          <p v-else-if="!comments.length">Belum ada komentar tersinkron.</p>
          <ul v-if="comments.length">
            <li v-for="comment in comments" :key="comment.id">
              <b>{{ comment.author_username || 'Pengguna' }}</b>
              <p>{{ comment.text || 'Komentar tanpa teks' }}</p>
            </li>
          </ul>
          <button v-if="commentsError || nextCursor" type="button" :disabled="commentsLoading"
            @click="readComments(nextCursor ?? undefined)">{{ commentsError ? 'Coba lagi' : 'Muat komentar lainnya' }}</button>
        </section>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.calendar{--navy:#0c2238;--line:#d9e8ef;--muted:#506b7d;--teal:#007987;color:var(--navy)}
.heading,.toolbar,.period,.filters,.view-options,.meta,.platforms{display:flex;align-items:center;gap:8px}
.heading,.toolbar{justify-content:space-between;flex-wrap:wrap;gap:14px}
.heading{margin-bottom:22px}
.heading h1{font-size:clamp(2rem,4vw,3rem);margin-bottom:9px}
.heading p{color:var(--muted);margin:0}
.action,.toolbar button,.filters button{min-height:38px;border:1px solid var(--line);border-radius:9px;padding:8px 11px;background:white;color:var(--navy);font-weight:750;text-decoration:none;cursor:pointer}
.action{background:#007987;color:white;border-color:transparent;padding:11px 15px}
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
.summary article{background:linear-gradient(115deg,white,#f0fbfe);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:13px;padding:12px 16px;display:grid;gap:4px}
.summary span{color:var(--muted);font-weight:700;font-size:.83rem}
.summary strong{font-size:1.6rem}
[data-state]{--accent:#64768b;--tint:#edf2f7}
[data-state=scheduled]{--accent:#135ea3;--tint:#e6f2ff}
[data-state=published]{--accent:#176447;--tint:#e5f6ec}
[data-state=attention],[data-state=partial],[data-state=unknown]{--accent:#825105;--tint:#fff4db}
[data-state=failed],[data-state=canceled]{--accent:#9b352f;--tint:#ffefed}
.board{background:white;border:1px solid var(--line);border-radius:17px;overflow:hidden}
.toolbar,.filters,.board footer{padding:13px 15px}
.period{flex-wrap:wrap}
.period h2{font-size:1.05rem;margin:0 0 0 5px}
.toolbar button:hover,.filters button:hover,.view-options button[aria-pressed=true]{background:#e1f8fb;color:#005965}
.filters button:disabled{opacity:.55;cursor:wait}
.filters{border-top:1px solid var(--line);flex-wrap:wrap}
.filters input,.filters select{width:auto;max-width:100%;min-height:38px;padding:7px 9px;border-color:var(--line);color:var(--navy)}
.filters input{flex:1;min-width:160px}
.zone,.board footer,.feedback{font-size:.8rem;color:var(--muted)}
.zone{white-space:nowrap}
.feedback{margin:0;padding:11px 15px;border-top:1px solid var(--line)}
.feedback.error{color:#822c21}
.calendar-scroll{overflow:auto}
.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-width:730px}
.weekday,.day{border-top:1px solid var(--line)}
.weekday{padding:8px;background:#f3fafc;text-align:center;font-size:.78rem;font-weight:800;color:var(--muted)}
.day{min-width:0;min-height:103px;padding:7px}
.grid .day:not(:nth-child(7n)){border-right:1px solid var(--line)}
.grid[data-mode=week] .day{min-height:230px}
.day.outside{background:#f6f9fb}
.day.today{background:#edfafd}
.day h3{display:inline-grid;place-items:center;min-width:27px;min-height:27px;margin:0 0 6px;padding:2px 5px;font-size:.84rem;color:#37546a}
.day.today h3{border-radius:8px;background:var(--teal);color:white}
.entries{display:grid;gap:5px}
.entry{min-width:0;display:grid;gap:3px;padding:6px;text-align:left;cursor:pointer;border:0;border-left:3px solid var(--accent);border-radius:7px;background:var(--tint);text-decoration:none;color:var(--navy)}
.entry:hover .entry-title{text-decoration:underline}
.meta{justify-content:space-between;color:var(--muted);font-size:.71rem;font-weight:750}
.platforms{gap:3px;flex-wrap:wrap;justify-content:flex-end}
.platforms img{width:14px;height:14px}
.entry-title,.product{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entry-title{font-size:.77rem}
.product,.state{font-size:.69rem}
.product{color:var(--muted)}
.state{color:var(--accent);font-weight:800}
.agenda .day{min-height:0;padding:9px 15px 13px}
.agenda .entries{grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))}
.board footer{border-top:1px solid var(--line)}
.schedule-dialog{width:min(540px,calc(100% - 28px));max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--line);border-radius:19px;color:var(--navy);box-shadow:0 20px 70px #0c22383d}
.schedule-dialog::backdrop{background:#102c4566}
.schedule-detail header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:22px;border-bottom:1px solid var(--line);background:linear-gradient(120deg,#f5fcff,var(--tint))}
.schedule-detail h2{margin:10px 0 0;font-size:clamp(1.3rem,4vw,1.75rem);overflow-wrap:anywhere}
.schedule-status{display:inline-block;padding:4px 9px;border-radius:999px;background:var(--tint);color:var(--accent);font-size:.8rem;font-weight:800}
.close-detail{width:42px;height:42px;border:1px solid var(--line);border-radius:11px;background:white;color:var(--navy);font-size:1.45rem;cursor:pointer}
.close-detail:hover{background:#e1f8fb}
.schedule-detail dl{display:grid;gap:14px;margin:0;padding:20px 22px}
.schedule-detail dt{margin-bottom:4px;color:var(--muted);font-size:.8rem;font-weight:700}
.schedule-detail dd{margin:0;font-weight:750;overflow-wrap:anywhere}
.detail-platforms{display:flex;flex-wrap:wrap;gap:8px}
.detail-platforms span{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:8px;background:#eef6fa;font-size:.8rem}
.detail-platforms img{width:16px;height:16px}
.schedule-caption{padding:16px 22px 22px;border-top:1px solid var(--line)}
.schedule-caption h3{margin:0 0 8px;font-size:.9rem}
.schedule-caption p{margin:0;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.schedule-media>img{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:10px;background:#f3fafc}
.media-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}
.media-controls button,.schedule-comments button{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:white;color:var(--navy);cursor:pointer}
.media-controls button:disabled,.schedule-comments button:disabled{opacity:.5;cursor:default}
.schedule-comments ul{display:grid;gap:10px;margin:10px 0;padding:0;list-style:none}
.schedule-comments li{padding:10px;border-radius:8px;background:#f3fafc}
@media(max-width:700px){.summary{gap:7px}.summary article{padding:9px}.summary span{font-size:.72rem}.filters input{flex-basis:100%}}
</style>
