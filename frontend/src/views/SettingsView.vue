<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { auth } from '../lib/auth'
import { api } from '../lib/api'
import type { AppSettings } from '../types'

type Integration = 'llm' | 'tebar' | 'apify'
type Toast = { type: 'success' | 'error'; message: string }

const form = reactive({
  appName: 'Pulse Content Platform',
  timezone: 'Asia/Jakarta',
  defaultLanguage: 'id',
  llm: { enabled: true, baseUrl: '', model: '', apiKey: '', apiKeyConfigured: false },
  tebar: { enabled: false, baseUrl: 'https://api.tebar.app/v1', profile: '', apiKey: '', apiKeyConfigured: false },
  apify: { enabled: false, baseUrl: 'https://api.apify.com/v2', apiToken: '', apiTokenConfigured: false },
})

const prompts = ref<AppSettings['contentPrompts']>()
const saving = ref(false)
const testing = reactive<Record<Integration, boolean>>({ llm: false, tebar: false, apify: false })
const toast = ref<Toast | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(type: Toast['type'], message: string) {
  toast.value = { type, message }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 6000)
}

function applySettings(settings: AppSettings) {
  form.appName = settings.appName
  form.timezone = settings.timezone
  form.defaultLanguage = settings.defaultLanguage
  prompts.value = settings.contentPrompts
  form.llm = { ...settings.llm, apiKey: '' }
  form.tebar = { ...settings.tebar, profile: settings.tebar.profile ?? '', apiKey: '' }
  form.apify = { ...settings.apify, apiToken: '' }
}

onMounted(async () => {
  try {
    const data = await api<{ settings: AppSettings }>('/settings')
    applySettings(data.settings)
  } catch (cause) {
    showToast('error', cause instanceof Error ? cause.message : 'Gagal memuat pengaturan')
  }
})

onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

async function save() {
  saving.value = true
  try {
    const data = await api<{ settings: AppSettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        appName: form.appName,
        timezone: form.timezone,
        defaultLanguage: form.defaultLanguage,
        ...(prompts.value ? { contentPrompts: { concept: prompts.value.concept, image: prompts.value.image } } : {}),
        llm: { enabled: form.llm.enabled, baseUrl: form.llm.baseUrl, model: form.llm.model, ...(form.llm.apiKey ? { apiKey: form.llm.apiKey } : {}) },
        tebar: { enabled: form.tebar.enabled, baseUrl: form.tebar.baseUrl, profile: form.tebar.profile || null, ...(form.tebar.apiKey ? { apiKey: form.tebar.apiKey } : {}) },
        apify: { enabled: form.apify.enabled, baseUrl: form.apify.baseUrl, ...(form.apify.apiToken ? { apiToken: form.apify.apiToken } : {}) },
      }),
    })
    applySettings(data.settings)
    showToast('success', 'Pengaturan berhasil disimpan')
  } catch (cause) {
    showToast('error', cause instanceof Error ? cause.message : 'Gagal menyimpan pengaturan')
  } finally {
    saving.value = false
  }
}

async function testConnection(integration: Integration) {
  testing[integration] = true
  try {
    if (integration === 'llm') {
      const result = await api<{ connected: boolean; modelAvailable: boolean }>('/settings/llm/test', { method: 'POST', body: JSON.stringify({ baseUrl: form.llm.baseUrl, model: form.llm.model, ...(form.llm.apiKey ? { apiKey: form.llm.apiKey } : {}) }) })
      if (!result.modelAvailable) throw new Error('Koneksi berhasil, tetapi model LLM tidak ditemukan')
      showToast('success', 'Koneksi LLM berhasil')
    } else if (integration === 'tebar') {
      await api('/settings/tebar/test', { method: 'POST', body: JSON.stringify({ baseUrl: form.tebar.baseUrl, profile: form.tebar.profile || null, ...(form.tebar.apiKey ? { apiKey: form.tebar.apiKey } : {}) }) })
      showToast('success', 'Koneksi Tebar berhasil')
    } else {
      await api('/settings/apify/test', { method: 'POST', body: JSON.stringify({ baseUrl: form.apify.baseUrl, ...(form.apify.apiToken ? { apiToken: form.apify.apiToken } : {}) }) })
      showToast('success', 'Koneksi Apify berhasil')
    }
  } catch (cause) {
    const fallback = `Koneksi ${integration === 'llm' ? 'LLM' : integration === 'tebar' ? 'Tebar' : 'Apify'} gagal`
    showToast('error', cause instanceof Error ? cause.message : fallback)
  } finally {
    testing[integration] = false
  }
}
</script>

<template>
  <Transition name="toast">
    <aside
      v-if="toast"
      :class="['toast-popup', toast.type === 'error' ? 'toast-error' : 'toast-success']"
      :role="toast.type === 'error' ? 'alert' : 'status'"
      aria-live="assertive"
    >
      <span class="toast-symbol">{{ toast.type === 'error' ? '!' : '✓' }}</span>
      <div>
        <strong>{{ toast.type === 'error' ? 'Koneksi gagal' : 'Berhasil' }}</strong>
        <p>{{ toast.message }}</p>
      </div>
      <button type="button" aria-label="Tutup notifikasi" @click="toast = null">×</button>
    </aside>
  </Transition>

  <header class="settings-header"><div class="title-icon">⚙</div><div><h1>Settings</h1><p>Kelola konfigurasi aplikasi, integrasi, dan prompt Konten Generator.</p></div></header>
  <nav class="settings-tabs" aria-label="Bagian pengaturan"><a href="#general" class="active">⚙ <span>General</span></a><a href="#prompts">◇ <span>Prompt Konten</span></a><a href="#integrations">↗ <span>Integrations (API)</span></a><RouterLink to="/users">♙ <span>Users &amp; Access</span></RouterLink></nav>

  <form class="settings-canvas" @submit.prevent="save">
    <div class="settings-top-grid">
      <section id="general" class="settings-card general-card">
        <header class="card-titlebar"><span class="section-icon">⚙</span><div><h2>General Application</h2><p>Pengaturan dasar aplikasi Pulse.</p></div></header>
        <div class="card-body form-stack"><label>Nama Aplikasi<input v-model.trim="form.appName" :disabled="!auth.isAdmin.value" required /></label><label>Zona Waktu<select v-model="form.timezone" :disabled="!auth.isAdmin.value"><option value="Asia/Jakarta">(GMT+07:00) Jakarta, Indonesia</option><option value="Asia/Makassar">(GMT+08:00) Makassar, Indonesia</option><option value="Asia/Jayapura">(GMT+09:00) Jayapura, Indonesia</option><option value="UTC">UTC</option></select></label><label>Bahasa Sistem<select v-model="form.defaultLanguage" :disabled="!auth.isAdmin.value"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></label></div>
      </section>

      <section id="prompts" class="settings-card agent-card">
        <header class="card-titlebar agent-titlebar"><span class="section-icon robot-icon" aria-hidden="true">●</span><div><h2>Prompt Konten Generator</h2><p>Atur prompt untuk generasi Manual dan Signal Agent.</p></div></header>
        <div class="prompt-body">
          <div class="robot-visual" aria-hidden="true"><i></i><div class="robot-head"><span></span><span></span></div><div class="robot-body">AI</div></div>
          <div v-if="prompts" class="form-stack prompt-editor">
            <label>Prompt konsep dan caption<textarea v-model="prompts.concept" rows="6" maxlength="10000" required :readonly="!auth.isAdmin.value" /></label>
            <label>Prompt gambar<textarea v-model="prompts.image" rows="7" maxlength="10000" required :readonly="!auth.isAdmin.value" /></label>
            <small>Variabel <code v-pre>{{ratio}}</code> diisi otomatis dengan rasio gambar.</small>
            <button v-if="auth.isAdmin.value" type="button" @click="Object.assign(prompts, prompts.defaults)">Kembalikan prompt bawaan</button>
            <details><summary>Lihat prompt bawaan</summary><h3>Konsep dan caption</h3><pre>{{ prompts.defaults.concept }}</pre><h3>Gambar</h3><pre>{{ prompts.defaults.image }}</pre></details>
          </div>
        </div>
      </section>
    </div>

    <section id="integrations" class="integrations-panel">
      <header class="integrations-heading"><span class="section-icon">↗</span><div><h2>Integrasi API</h2><p>Kelola koneksi dengan layanan eksternal LLM, Tebar, dan Apify.</p></div></header>
      <div class="integration-grid">
        <article class="integration-card"><header><span class="provider-icon llm-mark">◎</span><div><h3>LLM <small>OpenAI-compatible</small></h3><p>Endpoint untuk generate konten.</p></div><label class="mini-switch"><input v-model="form.llm.enabled" type="checkbox" /><span class="switch"></span></label></header><div class="integration-fields"><label>LLM Base URL<input v-model.trim="form.llm.baseUrl" type="url" placeholder="https://api.example.com/v1" required /></label><label>LLM API key<input v-model.trim="form.llm.apiKey" type="password" autocomplete="new-password" :placeholder="form.llm.apiKeyConfigured ? 'Tersimpan — isi untuk mengganti' : 'Masukkan API key'" /></label><label>Model LLM<input v-model.trim="form.llm.model" placeholder="gpt-4.1-mini" required /></label></div><footer><button type="button" aria-label="Tes koneksi LLM" :disabled="testing.llm" @click="testConnection('llm')">{{ testing.llm ? 'Menguji…' : '⌁ Tes Koneksi' }}</button><code>GET /models</code></footer></article>
        <article class="integration-card"><header><span class="provider-icon tebar-mark">◇</span><div><h3>Tebar API</h3><p>Publikasi dan data social media.</p></div><label class="mini-switch"><input v-model="form.tebar.enabled" type="checkbox" /><span class="switch"></span></label></header><div class="integration-fields"><label>Tebar Base URL<input v-model.trim="form.tebar.baseUrl" type="url" required /></label><label>Tebar API key<input v-model.trim="form.tebar.apiKey" type="password" autocomplete="new-password" :placeholder="form.tebar.apiKeyConfigured ? 'Tersimpan — isi untuk mengganti' : 'tb_live_...'" /></label><label>Tebar Profile <small>(opsional)</small><input v-model.trim="form.tebar.profile" placeholder="Profile ID atau external ID" /></label></div><footer><button type="button" aria-label="Tes koneksi Tebar" :disabled="testing.tebar" @click="testConnection('tebar')">{{ testing.tebar ? 'Menguji…' : '⌁ Tes Koneksi' }}</button><code>GET /me</code></footer></article>
        <article class="integration-card"><header><span class="provider-icon apify-mark">ϟ</span><div><h3>Apify API</h3><p>Data scraping dan monitoring.</p></div><label class="mini-switch"><input v-model="form.apify.enabled" type="checkbox" /><span class="switch"></span></label></header><div class="integration-fields"><label>Apify Base URL<input v-model.trim="form.apify.baseUrl" type="url" required /></label><label>Apify API token<input v-model.trim="form.apify.apiToken" type="password" autocomplete="new-password" :placeholder="form.apify.apiTokenConfigured ? 'Tersimpan — isi untuk mengganti' : 'Masukkan API token'" /></label></div><footer><button type="button" aria-label="Tes koneksi Apify" :disabled="testing.apify" @click="testConnection('apify')">{{ testing.apify ? 'Menguji…' : '⌁ Tes Koneksi' }}</button><code>GET /users/me</code></footer></article>
      </div>
    </section>
    <div v-if="auth.isAdmin.value" class="save-row"><button class="save-settings" type="submit" :disabled="saving">{{ saving ? 'Menyimpan…' : '✓ Simpan Pengaturan' }}</button></div><p v-else class="read-only-note">Pengaturan hanya dapat diubah oleh admin.</p>
  </form>
</template>

<style scoped>
.settings-header{display:flex;align-items:center;gap:16px;margin-bottom:18px}.settings-header h1{margin:0;color:#07172f;font-size:clamp(2rem,3vw,3.25rem);letter-spacing:-.045em}.settings-header p{margin:3px 0 0;color:#52677d}.title-icon{color:#07172f;font-size:2.4rem}.settings-tabs{display:flex;gap:22px;overflow-x:auto;margin-bottom:24px;padding-bottom:9px;border-bottom:1px solid #d6e7ef}.settings-tabs a{display:flex;align-items:center;gap:9px;min-width:max-content;padding:12px 24px;color:#183650;border-radius:999px;text-decoration:none;font-weight:800}.settings-tabs a.active{color:white;background:linear-gradient(135deg,#00a9c3,#08c5d6);box-shadow:0 8px 18px #02b7cc38}.settings-canvas{display:grid;gap:22px}.settings-top-grid{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(620px,1.52fr);gap:20px}.settings-card,.integrations-panel{overflow:hidden;border:1px solid #d5e9f2;border-radius:22px;background:#ffffffe6;box-shadow:0 14px 34px #1c709114}.card-titlebar,.integrations-heading{display:flex;align-items:center;gap:14px;padding:18px 22px;background:linear-gradient(105deg,#eaf7ff,#f6fbff)}.card-titlebar h2,.integrations-heading h2{margin:0;color:#07172f;font-size:1.3rem}.card-titlebar p,.integrations-heading p{margin:3px 0 0;color:#4f687d;font-size:.85rem}.section-icon{display:grid;flex:0 0 42px;width:42px;height:42px;place-items:center;color:#06b8d0;border-radius:50%;background:white;font-size:1.5rem;box-shadow:0 5px 15px #04b7cf26}.card-body{padding:20px}.form-stack{display:grid;gap:16px}.form-stack label,.integration-fields label,.time-grid label{color:#11263d;font-size:.84rem;font-weight:800}.form-stack input,.form-stack select,.integration-fields input,.time-grid input,.frequency-row input,.frequency-row select{margin-top:7px;border-color:#cfe0e9;border-radius:12px;background:#fff}.agent-titlebar{background:linear-gradient(100deg,#e7fbff,#f4fcff)}.agent-titlebar h2 small{font-size:.72em}.switch-label{display:flex;align-items:center;gap:11px;margin-left:auto;color:#10263d;font-size:.82rem;font-weight:800}.switch-label input,.mini-switch input{position:absolute;opacity:0}.switch{position:relative;display:block;width:46px;height:25px;border-radius:999px;background:#c7d5dc;transition:.2s}.switch:after{position:absolute;top:3px;left:3px;width:19px;height:19px;content:'';border-radius:50%;background:white;box-shadow:0 2px 6px #617b88;transition:.2s}input:checked+.switch{background:#08b9cf}input:checked+.switch:after{transform:translateX(21px)}input:focus-visible+.switch{outline:3px solid #04b6cf40;outline-offset:2px}.agent-body{display:grid;grid-template-columns:150px minmax(330px,1fr) minmax(210px,.75fr);gap:18px;align-items:center;padding:18px}.robot-visual{position:relative;display:grid;align-content:center;justify-items:center;min-height:210px;border-radius:30px;background:radial-gradient(circle,#c4f7fb,#effcff 68%)}.robot-visual>i{width:8px;height:26px;background:#08bdd2}.robot-visual>i:before{display:block;width:15px;height:15px;margin:-8px 0 0 -3.5px;content:'';border-radius:50%;background:#08bdd2;box-shadow:0 0 16px #08bdd2}.robot-head{display:flex;gap:28px;padding:27px 25px;border:7px solid white;border-radius:42% 42% 35% 35%;background:#12384f;box-shadow:0 10px 20px #02a0be40}.robot-head span{width:11px;height:18px;border-radius:999px;background:#8af9ff;box-shadow:0 0 12px #8af9ff}.robot-body{margin-top:-3px;padding:15px 27px;color:#06a9c1;border:6px solid white;border-radius:18px;background:#d9f9fc;font-weight:900}.agent-controls{display:grid;gap:14px}.schedule-box{padding:15px;border:1px solid #d2e5ed;border-radius:16px;background:#fff}.schedule-box>strong{display:block;margin-bottom:11px;color:#0c2037;font-size:.9rem}.frequency-row{display:grid;grid-template-columns:auto 82px 1fr;gap:9px;align-items:center}.frequency-row span{color:#304b60;font-weight:700}.frequency-row input,.frequency-row select{margin:0}.time-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.day-picker{display:flex;flex-wrap:wrap;gap:8px;align-content:center;margin:0;padding:0;border:0}.day-picker legend{width:100%;margin-bottom:7px;color:#0c2037;font-size:.88rem;font-weight:900}.day-picker label{padding:7px 10px;color:#26465d;border:1px solid #bcd2dd;border-radius:9px;background:#f8fbfc;font-size:.78rem;font-weight:800;cursor:pointer}.day-picker label.selected{color:white;border-color:#06b5ca;background:#06b5ca}.day-picker input{position:absolute;opacity:0}.integrations-panel{padding-bottom:20px}.integrations-heading{background:transparent}.integration-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 20px}.integration-card{display:flex;min-width:0;flex-direction:column;padding:18px;border:1px solid #d5e6ee;border-radius:18px;background:white;box-shadow:0 8px 20px #1e668214}.integration-card header{display:grid;grid-template-columns:42px 1fr auto;gap:11px;align-items:start}.provider-icon{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;font-size:1.65rem;font-weight:900}.llm-mark{color:#111;background:#f0f4f6}.tebar-mark{color:#963bff;background:#f1e6ff}.apify-mark{color:#f1a400;background:#fff2ce}.integration-card h3{margin:0;color:#07172f;font-size:1.18rem}.integration-card h3 small{display:inline-block;margin-left:6px;padding:4px 7px;color:#009db6;border-radius:999px;background:#dff8fc;font-size:.62rem}.integration-card header p{margin:4px 0 0;color:#5d7080;font-size:.78rem}.mini-switch{cursor:pointer}.mini-switch .switch{width:42px;height:23px}.mini-switch .switch:after{width:17px;height:17px}.mini-switch input:checked+.switch:after{transform:translateX(19px)}.integration-fields{display:grid;gap:12px;margin:20px 0}.integration-fields label{display:grid;grid-template-columns:105px 1fr;align-items:center;gap:8px}.integration-fields label small{font-weight:500}.integration-fields input{min-width:0;margin:0;padding:10px 12px}.integration-card footer{display:flex;align-items:center;gap:10px;margin-top:auto}.integration-card footer button{min-height:40px;padding:8px 15px;color:#00a9c2;border:1px solid #00b7d0;border-radius:999px;background:white;font-weight:900;cursor:pointer}.integration-card footer button:hover{color:white;background:#00b5cd}.integration-card footer button:disabled{opacity:.55;cursor:wait}.integration-card footer code{padding:10px 14px;color:#274257;border-radius:999px;background:#edf6fa;font-family:inherit;font-size:.72rem;font-weight:800}.save-row{display:flex;justify-content:flex-end}.save-settings{min-width:250px;padding:15px 24px;color:white;border:0;border-radius:999px;background:linear-gradient(100deg,#05b4cb,#00c2d3);box-shadow:0 10px 22px #00b0c83d;font-size:1rem;font-weight:900;cursor:pointer}.save-settings:disabled{opacity:.58;cursor:wait}.read-only-note{padding:14px;color:#7e5b20;border-radius:12px;background:#fff4cf}.toast-popup{position:fixed;z-index:100;top:24px;right:24px;display:grid;grid-template-columns:38px 1fr 28px;gap:12px;align-items:center;width:min(420px,calc(100vw - 32px));padding:15px 16px;color:white;border-radius:15px;box-shadow:0 18px 45px #122c3940}.toast-error{background:linear-gradient(135deg,#d94040,#b91c2b)}.toast-success{background:linear-gradient(135deg,#08a98e,#087d72)}.toast-symbol{display:grid;width:34px;height:34px;place-items:center;border-radius:50%;background:#ffffff33;font-size:1.25rem;font-weight:900}.toast-popup strong{display:block}.toast-popup p{margin:2px 0 0;color:inherit;font-size:.83rem}.toast-popup button{color:white;border:0;background:transparent;font-size:1.4rem;cursor:pointer}.toast-enter-active,.toast-leave-active{transition:.22s ease}.toast-enter-from,.toast-leave-to{opacity:0;transform:translateY(-12px)}
@media(max-width:1200px){.settings-top-grid{grid-template-columns:1fr}.integration-grid{grid-template-columns:1fr 1fr}.agent-body{grid-template-columns:140px 1fr}.day-picker{grid-column:1/-1}}@media(max-width:760px){.settings-tabs{gap:5px}.settings-tabs a{padding:10px 13px}.settings-tabs a span{display:none}.integration-grid{grid-template-columns:1fr;padding:0 12px}.agent-body{grid-template-columns:1fr}.robot-visual{display:none}.switch-label{font-size:0}.integration-fields label{grid-template-columns:1fr}.toast-popup{top:16px;right:16px}.save-settings{width:100%}.frequency-row{grid-template-columns:auto 74px 1fr}}

.prompt-body{display:grid;grid-template-columns:minmax(125px,.32fr) minmax(0,1fr);gap:16px;padding:18px;align-items:start}
.prompt-editor textarea{width:100%;padding:10px;border:1px solid #c9e3e9;border-radius:11px;font:inherit;resize:vertical}
.prompt-editor pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.82rem}
.prompt-editor :is(button,summary){cursor:pointer}
.robot-head span{animation:prompt-eye-movement 5s ease-in-out infinite}
@keyframes prompt-eye-movement{0%,45%,75%,100%{transform:translateX(0)}53%,63%{transform:translateX(5px)}92%{transform:scaleY(.15)}}
@media(prefers-reduced-motion:reduce){.robot-head span{animation:none}}
@media(max-width:760px){.prompt-body{grid-template-columns:1fr}.prompt-body .robot-visual{display:grid;min-height:110px}}
</style>
