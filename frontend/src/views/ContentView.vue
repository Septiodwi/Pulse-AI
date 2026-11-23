<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { auth } from '../lib/auth'

const labels = { PREVIEW: 'Pratinjau', DRAFT: 'Draft', REVIEW: 'Menunggu Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }
type Status = keyof typeof labels
interface Content {
  id: string
  status: Status
  source: 'MANUAL' | 'SIGNAL'
  title: string
  productName: string
  executionId?: string
  publication?: { postId?: string; scheduledAt: string | null; status?: string }
  productId: string
  caption: string
  image: string
  additionalImages?: string[]
  carousel?: { topic: string; takeaway: string; slides: { message: string }[] }
  imageReason: string
  captionReason: string
  createdAt: string
  history: { status: Status; at: string }[]
}
const route = useRoute()
const router = useRouter()
const manual = computed(() => route.path.endsWith('/new'))
const products = ref<{ id: string; name: string }[]>([])
const items = ref<Content[]>([])
const result = ref<Content>()
const detail = ref<Content>()
const dialog = ref<HTMLDialogElement>()
const form = ref({ productId: '', brief: '', goal: '', kind: 'Post Media Sosial', ratio: '1:1', style: 'Ceria & Edukatif' })
const imageMode = ref('single')
const imageCount = ref(2)
const slide = ref(0)
const detailSlide = ref(0)
const imagesOf = (item: Content) => [item.image, ...(item.additionalImages ?? [])]
const formBody = computed(() => JSON.stringify({ ...form.value, goal: form.value.goal || undefined, imageCount: imageMode.value === 'carousel' ? imageCount.value : 1 }))
const generatedForm = ref('')
const busy = ref(false)
const generating = ref(false)
const step = computed(() => generating.value ? 2 : result.value && generatedForm.value === formBody.value ? 3 : 1)
const attempted = ref(false)
const error = ref('')
const source = ref('')
const status = ref('')
const product = ref('')
const search = ref('')
const page = ref(1)
const tabs = [{ id: '', name: 'Semua Konten' }, { id: 'SIGNAL', name: 'Dibuat oleh Agent' }, { id: 'MANUAL', name: 'Dibuat Manual' }]
interface Comment { id: string; text: string | null; author_username: string | null; commented_at: string; account: { platform: string } }
interface CommentPage { status: string; count: number | null; comments: Comment[]; nextCursor: string | null }
const counts = ref<Record<string, number | null>>({})
const publicationStates = ref<Record<string, string>>({})
const publicationLabels: Record<string, string> = {
  scheduled: 'Terjadwal', publishing: 'Sedang diposting', published: 'Diposting',
  partial: 'Terbit sebagian', failed: 'Gagal diposting', draft: 'Draft di Tebar', canceled: 'Dibatalkan',
}
const scheduledAt = ref('')
const commentDialog = ref<HTMLDialogElement>()
const commentItem = ref<Content>()
const comments = ref<Comment[]>([])
const nextCursor = ref<string | null>(null)
const commentsBusy = ref(false)
const commentsError = ref('')
let commentRequest: AbortController | undefined
const statuses = ['DRAFT', 'REVIEW', 'APPROVED', 'REJECTED'] as const
const filtered = computed(() => items.value.filter((item) =>
  (!route.query.executionId || item.executionId === route.query.executionId) &&
  (!source.value || item.source === source.value) && (!status.value || item.status === status.value) &&
  (!product.value || item.productId === product.value) &&
  `${item.title} ${item.productName} ${item.caption}`.toLowerCase().includes(search.value.trim().toLowerCase()),
))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))
const rows = computed(() => filtered.value.slice((page.value - 1) * 5, page.value * 5))
const date = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))

watch([source, status, product, search], () => { page.value = 1 })
watch(totalPages, (pages) => { page.value = Math.min(page.value, pages) })

watch(rows, (visible) => {
  for (const item of visible) {
    if (!item.publication?.postId) continue
    void api<CommentPage>(`/content/${item.id}/comments?count=1`).then((data) => {
      counts.value[item.id] = data.count
      publicationStates.value[item.id] = data.status
    }).catch(() => { counts.value[item.id] = null })
  }
})

async function readComments(item: Content, cursor?: string) {
  if (cursor && commentsBusy.value) return
  if (!cursor) {
    commentItem.value = item
    comments.value = []
    nextCursor.value = null
    commentDialog.value?.showModal()
  }
  commentRequest?.abort()
  const request = new AbortController()
  commentRequest = request
  commentsError.value = ''
  commentsBusy.value = true
  try {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const data = await api<CommentPage>(`/content/${item.id}/comments${query}`, { cache: 'no-store', signal: request.signal })
    if (request.signal.aborted) return
    comments.value = [...comments.value, ...data.comments]
    nextCursor.value = data.nextCursor
    publicationStates.value[item.id] = data.status
    if (data.count !== null) counts.value[item.id] = data.count
  } catch (cause) {
    if (!request.signal.aborted) commentsError.value = (cause as Error).message
  } finally {
    if (commentRequest === request) commentsBusy.value = false
  }
}

async function load() {
  const { items: list } = await api<{ items: Content[] }>('/content')
  items.value = list
}

watch(manual, async (newContent) => {
  error.value = ''
  try {
    if (newContent) {
      attempted.value = false
      result.value = undefined
      products.value = (await api<{ products: typeof products.value }>('/products')).products
    } else {
      await load()
      const selected = items.value.find((item) => item.id === route.query.detail && (!route.query.executionId || item.executionId === route.query.executionId))
      if (selected) open(selected)
    }
  } catch (cause) { error.value = (cause as Error).message }
}, { immediate: true })

async function generate() {
  busy.value = true
  generating.value = true
  attempted.value = true
  error.value = ''
  const body = formBody.value
  try {
    const previous = result.value?.productId === form.value.productId ? result.value : undefined
    const payload = previous
      ? JSON.stringify({ ...JSON.parse(body), previous: { title: previous.title, caption: previous.caption } })
      : body
    const { content } = await api<{ content: Content }>('/content/generate', { method: 'POST', body: payload })
    if (previous && (JSON.stringify(imagesOf(content)) === JSON.stringify(imagesOf(previous)) || content.caption === previous.caption)) {
      error.value = 'Provider mengembalikan gambar atau caption yang sama. Coba Generate Ulang.'
      return
    }
    slide.value = 0
    result.value = content
    generatedForm.value = body
  } catch (cause) { error.value = (cause as Error).message }
  finally { generating.value = false; busy.value = false }
}

async function regenerateSlide(item: Content, index: number) {
  busy.value = true
  generating.value = true
  error.value = ''
  try {
    const { content } = await api<{ content: Content }>(`/content/${item.id}/slides/${index}/regenerate`, { method: 'POST' })
    result.value = content
  } catch (cause) { error.value = (cause as Error).message }
  finally { generating.value = false; busy.value = false }
}

async function transition(item: Content, next: Status) {
  busy.value = true
  error.value = ''
  try {
    const schedule = item.publication ? item.publication.scheduledAt
      : scheduledAt.value ? new Date(`${scheduledAt.value}+07:00`).toISOString() : undefined
    await api(`/content/${item.id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: next, ...(next === 'APPROVED' && schedule ? { scheduledAt: schedule } : {}) }),
    })
    if (manual.value) await router.push('/content')
    else {
      await load()
      if (detail.value?.id === item.id) detail.value = items.value.find((row) => row.id === item.id)
    }
  } catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}

function open(item: Content) {
  scheduledAt.value = ''
  detailSlide.value = 0
  detail.value = item
  dialog.value?.showModal()
}

async function copyCaption(caption: string) {
  try { await navigator.clipboard.writeText(caption) }
  catch { error.value = 'Caption gagal disalin.' }
}
</script>

<template>
  <section class="generator">
    <header>
      <RouterLink v-if="manual" to="/content">Content Idea Generator</RouterLink>
      <small v-else>AI CONTENT</small>
      <h1>{{ manual ? 'Buat Konten Manual' : 'Content Idea Generator' }}</h1>
      <p>{{ manual ? 'Buat gambar dan caption promosi berdasarkan Brand Profile.' : 'Kelola konten promosi dari generator manual dan AI Content Intelligence.' }}</p>
    </header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template v-if="manual">
      <ol class="steps" :style="{ '--step-progress': (step - 1) / 2 }" aria-label="Tahapan pembuatan konten">
        <li v-for="(label, index) in ['Atur Konten', 'Hasil Generate', 'Simpan Konten']" :key="label"
            :class="{ current: step === index + 1, complete: step > index + 1 }"
            :aria-current="step === index + 1 ? 'step' : undefined">
          <span>{{ step > index + 1 ? '✓' : index + 1 }}</span>{{ label }}
        </li>
      </ol>
      <div class="columns">
        <form id="content-form" class="panel" @submit.prevent="generate">
          <h2>Informasi Konten</h2>
          <fieldset :disabled="busy">
            <label>Pilih Produk
              <select v-model="form.productId" required><option value="" disabled>Pilih produk</option><option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option></select>
            </label>
            <label>Brief Konten
              <textarea v-model="form.brief" required maxlength="2000" rows="6" placeholder="Tema, pesan utama, dan target audiens" />
            </label>
            <small class="count">{{ form.brief.length }} / 2.000</small>
            <label>Tujuan Konten
              <select v-model="form.goal">
                <option value="">Pilih tujuan (opsional)</option>
                <optgroup label="TOFU — Awareness">
                  <option value="TOFU_EDUCATION">Edukasi</option>
                  <option value="TOFU_ENTERTAINMENT">Hiburan</option>
                  <option value="TOFU_INSPIRATION">Inspirasi</option>
                </optgroup>
                <optgroup label="MOFU — Consideration">
                  <option value="MOFU_CASE_STUDY">Studi Kasus</option>
                  <option value="MOFU_COMPARISON">Perbandingan</option>
                  <option value="MOFU_LEAD_MAGNET">Webinar atau E-book</option>
                  <option value="MOFU_FAQ">FAQ dan Mitos vs Fakta</option>
                </optgroup>
                <optgroup label="BOFU — Conversion">
                  <option value="BOFU_SOCIAL_PROOF">Testimoni dan Ulasan</option>
                  <option value="BOFU_DEMO">Demo Produk atau Tutorial</option>
                  <option value="BOFU_OFFER">Promo dan Penawaran Terbatas</option>
                </optgroup>
              </select>
            </label>
            <div class="preferences">
              <label>Format Post<select v-model="imageMode"><option value="single">Single Post</option><option value="carousel">Carousel</option></select></label>
              <label v-if="imageMode === 'carousel'">Jumlah gambar<select v-model.number="imageCount"><option v-for="count in [2, 3, 4, 5]" :key="count" :value="count">{{ count }}</option></select></label>
              <label>Jenis Konten<select v-model="form.kind"><option>Post Media Sosial</option><option>Story</option><option>Banner</option></select></label>
              <label>Rasio Gambar<select v-model="form.ratio"><option>1:1</option><option>4:5</option><option>9:16</option><option>16:9</option></select></label>
              <label>Gaya Visual<select v-model="form.style"><option>Ceria &amp; Edukatif</option><option>Minimalis</option><option>Premium</option><option>Natural</option></select></label>
            </div>
          </fieldset>
        </form>
        <div class="panel" :aria-busy="busy">
          <h2>Hasil Generate AI</h2>
          <div v-if="generating" class="pulse-loading" role="status">
            <div class="loading-brand" aria-hidden="true">pu<b>ϟ</b>se</div>
            <p>{{ result ? 'Membuat variasi gambar dan caption…' : 'Membuat gambar dan caption…' }}</p>
          </div>
          <template v-else-if="result">
            <div class="result">
              <div>
                <img :src="imagesOf(result)[slide]" :alt="`${result.title}, gambar ${slide + 1}`" />
                <nav v-if="imagesOf(result).length > 1" class="slide-picker result-slides" aria-label="Pilih gambar hasil">
                  <button v-for="(image, index) in imagesOf(result)" :key="index" type="button"
                          :aria-pressed="slide === index" @click="slide = index">
                    <img :src="image" alt="" /><span>Slide {{ index + 1 }}</span>
                  </button>
                </nav>
                <div v-if="result.carousel" class="inset">
                  <strong>{{ result.carousel.topic }}</strong>
                  <p>{{ result.carousel.slides[slide]?.message }}</p>
                  <button type="button" :disabled="busy || generatedForm !== formBody" @click="regenerateSlide(result, slide)">Generate Ulang Slide {{ slide + 1 }}</button>
                </div>
              </div>
              <section class="inset"><h3>Caption <button type="button" @click="copyCaption(result.caption)">Salin</button></h3><p class="caption">{{ result.caption }}</p></section>
            </div>
            <section class="inset"><h3>Penjelasan Rekomendasi AI</h3><dl><dt>Gambar</dt><dd>{{ result.imageReason }}</dd><dt>Caption</dt><dd>{{ result.captionReason }}</dd></dl></section>
          </template>
          <p v-else class="empty">Hasil gambar dan caption akan tampil di sini.</p>
        </div>
      </div>
      <footer class="actions">
        <RouterLink to="/content">Kembali</RouterLink>
        <button form="content-form" type="submit" :disabled="busy || !form.productId || !form.brief.trim()" :class="{ primary: !result }">{{ attempted ? 'Generate Ulang' : 'Generate' }}</button>
        <button v-if="result" class="primary" :disabled="busy || generatedForm !== JSON.stringify(form)" @click="transition(result, 'DRAFT')">Simpan Konten</button>
      </footer>
    </template>
    <template v-else>
      <div class="metrics">
        <div><span>Total Konten</span><strong>{{ items.length }}</strong></div>
        <div v-for="state in statuses" :key="state" :data-status="state"><span>{{ labels[state] }}</span><strong>{{ items.filter((item) => item.status === state).length }}</strong></div>
      </div>
      <div class="toolbar">
        <div class="tabs" aria-label="Sumber konten"><button v-for="tab in tabs" :key="tab.id" :aria-pressed="source === tab.id" :class="{ primary: source === tab.id }" @click="source = tab.id">{{ tab.name }}</button></div>
        <RouterLink v-if="auth.isAdmin.value" class="primary" to="/content/new">+ Buat Konten Baru</RouterLink>
      </div>
      <p v-if="route.query.executionId">Hasil dari riwayat pengambilan terpilih · <RouterLink to="/content">Lihat semua konten</RouterLink></p>
      <div class="filters">
        <input v-model="search" aria-label="Cari konten" placeholder="Cari judul, produk, atau caption" />
        <select v-model="product" aria-label="Filter produk"><option value="">Semua Produk</option><option v-for="item in new Map(items.map((row) => [row.productId, row.productName]))" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select>
        <select v-model="status" aria-label="Filter status"><option value="">Semua Status</option><option v-for="state in statuses" :key="state" :value="state">{{ labels[state] }}</option></select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Thumbnail</th><th>Judul Konten</th><th>Produk</th><th>Sumber</th><th>Status</th><th>Tanggal Dibuat</th><th>Komentar</th><th>Aksi</th></tr></thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td><img class="thumb" :src="item.image" alt="" /><small v-if="item.additionalImages?.length">Carousel · {{ imagesOf(item).length }}</small></td>
              <td><button class="title-button" @click="open(item)">{{ item.title }}</button><small class="excerpt">{{ item.caption }}</small></td>
              <td>{{ item.productName }}</td><td>{{ item.source === 'SIGNAL' ? 'AI Content Intelligence' : 'Manual' }}</td>
              <td><span class="badge" :data-status="item.status">{{ publicationLabels[publicationStates[item.id] ?? item.publication?.status ?? ''] ?? labels[item.status] }}</span></td><td>{{ date(item.createdAt) }}</td>
              <td><button v-if="item.publication?.postId" :aria-label="`Lihat komentar ${item.title}`" @click="readComments(item)">{{ counts[item.id] ?? '—' }}</button><span v-else>—</span></td>
              <td><button @click="open(item)">Detail</button></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="empty">Belum ada konten yang cocok.</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="toolbar pagination"><span>{{ filtered.length }} konten</span><div><button :disabled="page === 1" @click="page--">Sebelumnya</button> {{ page }} / {{ totalPages }} <button :disabled="page === totalPages" @click="page++">Berikutnya</button></div></footer>
      <dialog ref="dialog" class="detail-dialog" aria-labelledby="detail-title" @close="detail = undefined">
        <div v-if="detail">
          <header class="detail-top">
            <span class="detail-icon" aria-hidden="true">✧</span><h2 id="detail-title">Detail Konten</h2>
            <span class="badge" :data-status="detail.status">{{ publicationLabels[publicationStates[detail.id] ?? detail.publication?.status ?? ''] ?? labels[detail.status] }}</span>
            <button class="detail-close" aria-label="Tutup detail" @click="dialog?.close()">×</button>
          </header>
          <div class="columns detail-content">
            <figure class="detail-preview">
              <img :src="imagesOf(detail)[detailSlide]" :alt="`${detail.title}, gambar ${detailSlide + 1}`" />
              <nav v-if="imagesOf(detail).length > 1" class="slide-picker" aria-label="Pilih gambar konten">
                <button v-for="(_, index) in imagesOf(detail)" :key="index" type="button" :aria-pressed="detailSlide === index" @click="detailSlide = index">{{ index + 1 }}</button>
              </nav>
              <figcaption v-if="detail.carousel">{{ detail.carousel.slides[detailSlide]?.message }}</figcaption>
              <figcaption><a :href="imagesOf(detail)[detailSlide]" :download="`konten-${detailSlide + 1}`">↓ Unduh gambar</a></figcaption>
            </figure>
            <div class="detail-info">
              <h3 class="detail-name">{{ detail.title }}</h3>
              <dl class="detail-meta">
                <div><dt>Produk</dt><dd>{{ detail.productName }}</dd></div>
                <div><dt>Sumber</dt><dd>{{ detail.source === 'SIGNAL' ? 'AI Content Intelligence' : 'Manual' }}</dd></div>
                <div><dt>Dibuat</dt><dd>{{ date(detail.createdAt) }} WIB</dd></div>
              </dl>
              <section v-if="detail.publication?.postId" class="inset">
                <h3>Publikasi Tebar</h3>
                <p>{{ publicationLabels[publicationStates[detail.id] ?? detail.publication.status ?? ''] }}</p>
                <code>{{ detail.publication.postId }}</code>
                <p v-if="detail.publication.scheduledAt">{{ date(detail.publication.scheduledAt) }} WIB</p>
              </section>
              <section class="inset"><h3>Caption <button @click="copyCaption(detail.caption)">Salin</button></h3><p class="caption">{{ detail.caption }}</p></section>
              <section class="inset"><h3>Penjelasan Hasil AI</h3><dl><dt>Gambar</dt><dd>{{ detail.imageReason }}</dd><dt>Caption</dt><dd>{{ detail.captionReason }}</dd></dl></section>
              <section class="inset"><h3>Riwayat Status</h3><ol class="history"><li v-for="entry in detail.history" :key="entry.status">{{ labels[entry.status] }} <small>{{ date(entry.at) }}</small></li></ol></section>
              <p v-if="error" role="alert" class="error">{{ error }}</p>
              <div v-if="auth.isAdmin.value" class="actions">
                <button v-if="detail.status === 'DRAFT'" class="primary" :disabled="busy" @click="transition(detail, 'REVIEW')">Ajukan Review</button>
                <template v-if="['REVIEW', 'APPROVED'].includes(detail.status) && !detail.publication?.postId">
                  <label v-if="!detail.publication">Jadwal publikasi (WIB)
                    <input v-model="scheduledAt" type="datetime-local" :disabled="busy" />
                    <small>Kosongkan untuk memposting sekarang.</small>
                  </label>
                  <button v-if="detail.status === 'REVIEW' && !detail.publication" :disabled="busy" @click="transition(detail, 'REJECTED')">Tolak</button>
                  <button class="primary" :disabled="busy" @click="transition(detail, 'APPROVED')">{{ busy ? 'Mengirim ke Tebar…' : detail.publication ? 'Ulangi Pengiriman' : scheduledAt ? 'Setujui & Jadwalkan' : 'Setujui & Posting Sekarang' }}</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </dialog>
      <dialog ref="commentDialog" class="comment-dialog" aria-labelledby="comment-title" @close="commentRequest?.abort()">
        <div class="toolbar"><h2 id="comment-title">Komentar</h2><button @click="commentDialog?.close()">Tutup</button></div>
        <p v-if="commentItem">{{ commentItem.title }}</p>
        <article v-for="comment in comments" :key="comment.id" class="inset">
          <strong>{{ comment.author_username || 'Pengguna' }}</strong>
          <small> · {{ comment.account.platform }} · {{ date(comment.commented_at) }}</small>
          <p class="caption">{{ comment.text }}</p>
        </article>
        <p v-if="commentsBusy" role="status">Memuat komentar…</p>
        <p v-else-if="commentsError" role="alert">{{ commentsError }}</p>
        <p v-else-if="!comments.length">{{ commentItem && ['published', 'partial'].includes(publicationStates[commentItem.id] ?? '') ? 'Belum ada komentar tersinkron.' : 'Komentar tersedia setelah konten terbit.' }}</p>
        <button v-if="commentItem && nextCursor" :disabled="commentsBusy" @click="readComments(commentItem, nextCursor)">Muat komentar berikutnya</button>
      </dialog>
    </template>
  </section>
</template>

<style scoped>
.generator{--line:#dcecf1;--muted:#476474;--cyan:#00b8d1;--panel:#fff;color:#112633}
header h1{font-size:clamp(1.8rem,4vw,2.55rem);letter-spacing:-.045em;margin:.15em 0}header p,header small,.pagination,.count{color:var(--muted)}header p{margin-bottom:24px}header small{font-weight:800}
button,a.primary,input,select,textarea{font:inherit;border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:white;color:inherit}button,a.primary{cursor:pointer;font-weight:750}button:disabled{opacity:.55;cursor:default}.primary{background:var(--cyan)!important;color:#082c35!important;border-color:transparent!important;text-decoration:none}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin-bottom:24px}.metrics div{border-radius:16px;padding:17px;background:#eaf9fc;font-weight:700}.metrics strong{display:block;font-size:2rem}
[data-status="DRAFT"]{background:#fff5ce!important;color:#725410}[data-status="REVIEW"]{background:#def5ff!important;color:#075888}[data-status="APPROVED"]{background:#e0f8df!important;color:#216818}[data-status="REJECTED"]{background:#ffe9ea!important;color:#962627}
.toolbar,.actions,.tabs,.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toolbar{justify-content:space-between;margin-bottom:14px}.filters{margin-bottom:16px}.filters input{flex:1;min-width:210px}
.table-wrap,.panel,dialog{background:var(--panel);border:1px solid var(--line);border-radius:17px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;vertical-align:middle}th{background:#e9f7fa;white-space:nowrap}td{border-top:1px solid #edf5f7}.thumb{width:75px;height:54px;object-fit:cover;border-radius:9px}.badge{display:inline-block;white-space:nowrap;padding:6px 9px;border-radius:20px;font-size:.83rem;font-weight:800}.title-button{padding:0;border:0;text-align:left}.excerpt{display:block;max-width:235px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}.pagination{margin-top:14px}
.steps{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));list-style:none;padding:0;margin:24px 0;color:var(--muted);font-weight:750}
.steps::before,.steps::after{content:'';position:absolute;inset-inline:16.67%;top:16px;height:3px;border-radius:3px;background:#dcecf1}
.steps::after{background:var(--cyan);transform:scaleX(var(--step-progress));transform-origin:left;transition:transform .45s ease}
.steps li{position:relative;z-index:1;display:grid;justify-items:center;gap:8px;text-align:center;transition:color .35s ease}
.steps li span{display:grid;place-items:center;width:34px;height:34px;border:2px solid #d9ecf0;border-radius:50%;background:white;transition:background .35s,border-color .35s,box-shadow .35s}
.steps .current,.steps .complete{color:#00778b}.steps .current span,.steps .complete span{border-color:var(--cyan);background:#d7faff}.steps .current span{box-shadow:0 0 0 5px #00b8d126}
.pulse-loading{display:grid;min-height:220px;place-content:center;justify-items:center;text-align:center;color:var(--muted)}
.loading-brand{display:flex;align-items:center;justify-content:center;width:108px;height:108px;border:1px solid #9bedf4;border-radius:50%;background:#e9fcff;color:#06879a;font-family:"Arial Rounded MT Bold","Avenir Next",sans-serif;font-size:2rem;font-weight:900;letter-spacing:-.09em;animation:pulse-halo 1.8s ease-in-out infinite}
.loading-brand b{animation:pulse-beat 1.8s ease-in-out infinite}
@keyframes pulse-halo{0%,100%{box-shadow:0 0 0 3px #00b8d12e}65%{box-shadow:0 0 0 19px #00b8d100}}
@keyframes pulse-beat{0%,100%{transform:scale(1)}30%{transform:scale(1.24)}55%{transform:scale(1.05)}}
@media(prefers-reduced-motion:reduce){.loading-brand,.loading-brand b{animation:none}.steps::after,.steps li,.steps li span{transition:none}}

.columns{display:grid;grid-template-columns:minmax(0, .9fr) minmax(0, 1.1fr);gap:18px}.panel,dialog{padding:clamp(14px,2vw,24px)}h2{font-size:1.35rem;margin:0 0 18px}fieldset{padding:0;border:0;margin:0;min-width:0}label{display:grid;gap:7px;font-weight:700;margin:0 0 12px}label input,label select,label textarea{width:100%;min-width:0;box-sizing:border-box;font-weight:400}.count{display:block;text-align:right}.preferences{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:16px}.result{display:grid;grid-template-columns:1fr 1fr;gap:12px}.result .inset{margin-top:0}.generator img{display:block;max-width:100%;border-radius:12px}.inset{padding:13px;background:#f0f8fa;border-radius:12px;margin-top:14px}.inset h3{margin:0;font-size:1rem;display:flex;gap:6px;align-items:center;justify-content:space-between}.inset button{padding:5px 8px}.caption{white-space:pre-wrap;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:auto 1fr;gap:10px;margin-bottom:0}dt{font-weight:750}dd{margin:0}.empty{text-align:center;color:var(--muted);padding:30px 10px}.actions{justify-content:flex-end;margin-top:16px}.actions a{margin-right:auto}.error{background:#ffeff0;color:#8e2331;padding:12px;border-radius:10px}
dialog{width:min(1060px,94vw);max-height:90vh;overflow:auto}dialog::backdrop{background:#12323d80}.history{padding-left:20px}.history small{color:var(--muted)}
@media(max-width:960px){.result{grid-template-columns:1fr}}
@media(max-width:740px){.columns{grid-template-columns:1fr}.steps{justify-content:flex-start}}
.comment-dialog{width:min(640px,94vw)}.comment-dialog>button{margin-top:12px}

.detail-dialog{padding:0;border-color:#c8edf3;box-shadow:0 24px 75px #0c34464a}
.detail-top{position:sticky;z-index:2;top:0;display:flex;align-items:center;gap:12px;padding:16px clamp(14px,3vw,26px);background:linear-gradient(105deg,#e8fbff,#fff 75%);border-bottom:1px solid var(--line)}
.detail-top h2{margin:0;flex:1}.detail-icon,.detail-close{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:12px;background:#d7f8fc;color:#00798c;font-size:1.35rem;padding:0}
.detail-content{padding:clamp(14px,3vw,26px);align-items:start;gap:clamp(14px,3vw,26px)}
.detail-preview{margin:0;min-width:0;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#f0fbfd}
.detail-preview img{width:100%;max-height:62vh;object-fit:contain;border-radius:0}
.detail-preview figcaption{display:flex;justify-content:center;padding:12px}
.detail-preview a{padding:8px 12px;border-radius:10px;background:#fff;color:#00798c;font-weight:750;text-decoration:none}
.detail-info{min-width:0}.detail-name{font-size:clamp(1.2rem,2.6vw,1.65rem);line-height:1.25;margin:0}.detail-meta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.detail-meta div{padding:7px 10px;border-radius:9px;background:#eff9fb}.detail-meta dt{font-size:.75rem;color:var(--muted)}.detail-meta dd{font-weight:750;overflow-wrap:anywhere}
.detail-info .inset{border:1px solid #e1f0f3}.detail-info code{overflow-wrap:anywhere}.detail-info .history{display:flex;flex-wrap:wrap;gap:10px;padding:0;list-style:none}.detail-info .history li{border-left:3px solid var(--cyan);padding-left:9px}.detail-info .history small{display:block}
@media(max-width:460px){.detail-icon{display:none}.detail-top{gap:6px}.detail-top .badge{white-space:normal}.detail-info .actions{align-items:stretch}.detail-info .actions input{max-width:100%}}
.slide-picker{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;padding:9px}.slide-picker button{padding:5px 10px}.slide-picker button[aria-pressed="true"]{background:#d7f8fc;border-color:#00b8d1;color:#00788b}
.result-slides button{display:grid;gap:4px;justify-items:center;font-size:.75rem}.result-slides img{width:48px;height:48px;object-fit:cover;border-radius:6px}
</style>
