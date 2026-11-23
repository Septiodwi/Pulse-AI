<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../lib/auth'

const router = useRouter()
const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const passwordVisible = ref(false)
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    await router.push('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Login gagal'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-story" aria-label="Tentang Pulse">
      <div class="story-copy">
        <div class="pulse-logo pulse-logo--hero" aria-label="Pulse">
          <span>pu</span>
          <svg viewBox="0 0 52 72" aria-hidden="true">
            <path d="M4 39h10L22 7c1-4 7-4 8 0l8 52 5-20h5" />
          </svg>
          <span>se</span>
        </div>
        <h1>Masuk ke Pulse</h1>
        <p>Satu platform untuk mengelola konten, layanan,<br />dan loyalitas pelanggan dalam satu ekosistem.</p>
      </div>

      <div class="product-preview" aria-hidden="true">
        <div class="dashboard-window">
          <aside class="preview-sidebar">
            <div class="pulse-logo pulse-logo--mini">
              <span>pu</span>
              <svg viewBox="0 0 52 72"><path d="M4 39h10L22 7c1-4 7-4 8 0l8 52 5-20h5" /></svg>
              <span>se</span>
            </div>
            <div class="preview-nav active"><i class="grid-icon"></i>Dashboard</div>
            <div class="preview-nav"><i>✦</i>AI Content</div>
            <div class="preview-nav"><i>▱</i>Omnichannel</div>
            <div class="preview-nav"><i>♙</i>Loyalty</div>
            <div class="preview-nav"><i>♧</i>Customers</div>
            <div class="preview-nav"><i>▥</i>Reports</div>
          </aside>
          <div class="preview-main">
            <h3>Ringkasan Aktivitas</h3>
            <div class="preview-stats">
              <article>
                <small>▣ &nbsp; Total Chat</small>
                <strong>2.481</strong>
                <em>▲ 12,4% <span>vs minggu lalu</span></em>
              </article>
              <article>
                <small>◷ &nbsp; Rata-rata Respons</small>
                <strong>1m 42d</strong>
                <em>▼ 18% <span>vs minggu lalu</span></em>
              </article>
            </div>
            <div class="chart-card">
              <h4>Chat &amp; Konversi Penjualan</h4>
              <svg viewBox="0 0 430 145" preserveAspectRatio="none">
                <path class="chart-grid" d="M0 35H430M0 75H430M0 115H430" />
                <path class="chart-cyan" d="M8 103C57 89 92 77 136 84s80 23 123-13 88-15 118-17 39-14 48-17" />
                <path class="chart-dark" d="M8 126c62-11 104-12 151-8s70 9 115-4 87-15 151-3" />
              </svg>
              <div class="chart-labels"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span></div>
            </div>
          </div>
        </div>

        <article class="feature-card feature-card--ai">
          <span class="feature-icon bolt">ϟ</span>
          <div><strong>AI-Powered</strong><small>Buat konten lebih cepat<br />dan efisien</small></div>
        </article>
        <article class="feature-card feature-card--data">
          <span class="feature-icon cube">◆</span>
          <div><strong>Data Terpusat</strong><small>Satu profil customer<br />lintas modul</small></div>
        </article>
        <article class="feature-card feature-card--safe">
          <span class="feature-icon shield">●</span>
          <div><strong>Aman &amp; Scalable</strong><small>Andal, aman, dan<br />siap bertumbuh</small></div>
        </article>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="pulse-logo pulse-logo--card" aria-label="Pulse">
          <span>pu</span>
          <svg viewBox="0 0 52 72" aria-hidden="true">
            <path d="M4 39h10L22 7c1-4 7-4 8 0l8 52 5-20h5" />
          </svg>
          <span>se</span>
        </div>

        <header>
          <h2>Selamat datang kembali</h2>
          <p>Masuk untuk melanjutkan ke dashboard Anda</p>
        </header>

        <form @submit.prevent="submit">
          <div class="field-group">
            <label for="email">Email</label>
            <div class="input-shell">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 6l9 7 9-7" /></svg>
              <input id="email" v-model.trim="email" name="email" type="email" autocomplete="email" placeholder="Masukkan email Anda" required />
            </div>
          </div>

          <div class="field-group">
            <label for="password">Password</label>
            <div class="input-shell">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <input id="password" v-model="password" name="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" placeholder="Masukkan password Anda" required />
              <button class="password-toggle" type="button" :aria-label="passwordVisible ? 'Sembunyikan password' : 'Tampilkan password'" @click="passwordVisible = !passwordVisible">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
              </button>
            </div>
          </div>

          <div class="form-options">
            <label class="remember"><input v-model="rememberMe" type="checkbox" /><span></span>Ingat saya</label>
            <button class="link-button" type="button">Lupa password?</button>
          </div>

          <p v-if="error" class="login-error" role="alert">{{ error }}</p>

          <button class="login-submit" type="submit" :disabled="loading">{{ loading ? 'Memeriksa...' : 'Masuk' }}</button>
          <button class="admin-button" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14H2v4h4v-4H4zm16 0h2v4h-4v-4h2zm0 4c0 2-1.5 3-4 3" /></svg>
            Hubungi admin
          </button>
        </form>

        <div class="register-row"><span></span><p>Belum punya akun? <button type="button">Daftar</button></p><span></span></div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  --cyan: #08bdd0;
  --cyan-deep: #00aabd;
  --text: #050505;
  --muted: #646871;
  display: grid;
  grid-template-columns: minmax(0, 58.9%) minmax(560px, 41.1%);
  min-height: 100vh;
  overflow: hidden;
  color: var(--text);
  background:
    radial-gradient(circle at 68% 15%, #ffffff 0 10%, transparent 31%),
    radial-gradient(circle at 33% 28%, #ffffff 0 12%, transparent 37%),
    linear-gradient(122deg, #fff 0%, #f9feff 25%, #d9f9fd 67%, #f5feff 100%);
}

.login-page::before,
.login-page::after {
  position: fixed;
  z-index: 0;
  content: '';
  pointer-events: none;
  border: 1px solid rgb(255 255 255 / .92);
  border-radius: 50%;
}

.login-page::before { width: 1080px; height: 1080px; left: -195px; top: -570px; }
.login-page::after { width: 1110px; height: 740px; left: -90px; bottom: -610px; }

.login-story,
.login-panel { position: relative; z-index: 1; min-width: 0; }

.login-story { padding: clamp(42px, 5.8vw, 92px) clamp(38px, 5.65vw, 95px); }

.story-copy { position: relative; z-index: 4; }

.pulse-logo { display: inline-flex; align-items: center; color: var(--cyan); font-family: "Arial Rounded MT Bold", "Avenir Next", sans-serif; font-weight: 900; letter-spacing: -.075em; line-height: 1; }
.pulse-logo svg { flex: 0 0 auto; overflow: visible; }
.pulse-logo path { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 10; }
.pulse-logo--hero { height: 82px; font-size: 77px; }
.pulse-logo--hero svg { width: 49px; height: 72px; margin: 4px -3px -1px -2px; }

.story-copy h1 { margin: 49px 0 8px; font-size: clamp(48px, 4.15vw, 70px); font-weight: 800; line-height: 1.05; letter-spacing: -.047em; }
.story-copy p { margin: 0; color: #585b61; font-size: clamp(20px, 1.65vw, 28px); line-height: 1.35; letter-spacing: -.025em; }

.product-preview { position: absolute; left: 7.9%; right: 4.4%; bottom: 1.5%; height: 55.5%; }
.product-preview::before { position: absolute; inset: 31% -14% -15% -11%; content: ''; background: radial-gradient(ellipse at center, rgb(0 205 224 / .31), transparent 67%); filter: blur(16px); }

.dashboard-window { position: absolute; left: 8%; top: 4%; width: 72%; height: 81%; display: grid; grid-template-columns: 24% 1fr; overflow: hidden; border: 1.5px solid #8ceaf3; border-radius: 25px 25px 8px 8px; background: rgb(255 255 255 / .87); box-shadow: 0 25px 45px rgb(0 157 177 / .18), 0 0 25px rgb(255 255 255 / .96); transform: perspective(1000px) rotateZ(3deg) rotateY(-3deg); transform-origin: center; }

.preview-sidebar { padding: 25px 12px; border-right: 1px solid #d7eef2; background: rgb(255 255 255 / .78); }
.pulse-logo--mini { height: 32px; margin: 0 8px 22px; font-size: 31px; }
.pulse-logo--mini svg { width: 21px; height: 31px; margin: 2px -2px 0; }
.pulse-logo--mini path { stroke-width: 9; }
.preview-nav { display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 12px; color: #456273; border-radius: 9px; font-size: 12px; white-space: nowrap; }
.preview-nav i { width: 15px; color: #51778a; font-style: normal; text-align: center; }
.preview-nav.active { color: white; background: var(--cyan); box-shadow: 0 7px 13px rgb(4 188 207 / .32); }
.preview-nav.active i { color: white; }
.grid-icon { width: 13px !important; height: 13px; border: 1px solid currentColor; border-radius: 3px; background: linear-gradient(90deg, transparent 42%, currentColor 43% 56%, transparent 57%), linear-gradient(transparent 42%, currentColor 43% 56%, transparent 57%); }

.preview-main { padding: 31px 18px 16px 25px; }
.preview-main h3 { margin: 0 0 17px; font-size: 18px; letter-spacing: -.035em; }
.preview-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
.preview-stats article { min-width: 0; padding: 14px 15px 11px; border: 1px solid #ccecf1; border-radius: 14px; background: rgb(255 255 255 / .71); }
.preview-stats small { display: block; overflow: hidden; color: #47606b; font-size: 9px; white-space: nowrap; }
.preview-stats strong { display: block; margin: 6px 0 1px; font-size: 27px; letter-spacing: -.04em; }
.preview-stats em { color: #05a766; font-size: 9px; font-style: normal; font-weight: 700; }
.preview-stats em span { color: #8a969b; font-weight: 400; }
.chart-card { margin-top: 14px; padding: 14px 15px 9px; border: 1px solid #ccecf1; border-radius: 15px; background: rgb(255 255 255 / .69); }
.chart-card h4 { margin: 0; font-size: 13px; }
.chart-card svg { width: 100%; height: 126px; overflow: visible; }
.chart-grid { fill: none; stroke: #d6edf1; stroke-width: 1; }
.chart-cyan, .chart-dark { fill: none; stroke-linecap: round; stroke-width: 3.5; }
.chart-cyan { stroke: var(--cyan); }
.chart-dark { stroke: #133646; stroke-width: 2.5; }
.chart-labels { display: flex; justify-content: space-between; padding: 0 5px; color: #57707c; font-size: 9px; }

.feature-card { position: absolute; z-index: 3; display: flex; align-items: center; gap: 17px; min-width: 255px; padding: 20px 25px; color: white; border: 2px solid rgb(255 255 255 / .86); border-radius: 18px; background: linear-gradient(145deg, rgb(21 205 218 / .72), rgb(0 170 190 / .94)); box-shadow: 0 18px 34px rgb(0 169 190 / .28), inset 0 0 25px rgb(255 255 255 / .16); backdrop-filter: blur(9px); }
.feature-card::before { position: absolute; width: 22px; height: 22px; content: ''; border-radius: 50%; background: white; filter: blur(8px); opacity: .95; }
.feature-card strong { display: block; font-size: 19px; line-height: 1.05; }
.feature-card small { display: block; margin-top: 4px; font-size: 13px; line-height: 1.25; }
.feature-icon { display: grid; flex: 0 0 54px; width: 54px; height: 54px; place-items: center; color: var(--cyan-deep); border-radius: 50%; background: white; font-size: 35px; font-weight: 900; }
.feature-card--ai { top: 5%; right: 0; }
.feature-card--ai::before { right: 4px; top: -7px; }
.feature-card--data { left: 0; bottom: 4%; }
.feature-card--data::before { left: 10px; top: -8px; }
.feature-card--safe { right: -5%; bottom: -1%; }
.feature-card--safe::before { right: 7px; top: -8px; }
.feature-icon.cube { clip-path: polygon(50% 4%, 91% 26%, 89% 72%, 50% 96%, 11% 73%, 9% 27%); border-radius: 0; font-size: 22px; }
.feature-icon.shield { clip-path: polygon(50% 0, 88% 16%, 82% 70%, 50% 100%, 18% 70%, 12% 16%); border-radius: 0; font-size: 20px; }

.login-panel { display: grid; place-items: center; padding: 4vh clamp(32px, 4.5vw, 75px) 4vh clamp(22px, 2.6vw, 44px); }
.login-card { width: min(100%, 604px); padding: clamp(36px, 4.15vh, 48px) clamp(44px, 3.45vw, 58px) clamp(30px, 3.7vh, 42px); border: 1.5px solid var(--cyan); border-radius: 38px; background: rgb(255 255 255 / .88); box-shadow: 0 20px 70px rgb(17 156 175 / .09); backdrop-filter: blur(18px); }
.pulse-logo--card { display: flex; justify-content: center; height: 59px; font-size: 57px; }
.pulse-logo--card svg { width: 37px; height: 54px; margin: 3px -3px 0 -2px; }
.login-card header { margin: 26px 0 32px; text-align: center; }
.login-card header h2 { margin: 0 0 6px; font-size: clamp(30px, 2.05vw, 38px); line-height: 1.12; letter-spacing: -.04em; }
.login-card header p { margin: 0; color: var(--muted); font-size: clamp(17px, 1.25vw, 21px); line-height: 1.35; }
.login-card form { display: block; }
.field-group { margin-bottom: 20px; }
.field-group > label { display: block; margin-bottom: 7px; color: #111; font-size: 17px; font-weight: 700; }
.input-shell { position: relative; display: flex; align-items: center; height: 60px; border: 1.5px solid #cbdde2; border-radius: 14px; background: rgb(255 255 255 / .76); transition: border-color .2s, box-shadow .2s; }
.input-shell:focus-within { border-color: var(--cyan); box-shadow: 0 0 0 3px rgb(8 189 208 / .13); }
.input-shell > svg { flex: 0 0 25px; width: 25px; height: 25px; margin-left: 21px; fill: none; stroke: #75838b; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
.input-shell input { width: 100%; height: 100%; min-width: 0; padding: 0 16px; color: #15181b; border: 0; outline: 0; background: transparent; font-size: 17px; }
.input-shell input::placeholder { color: #777d87; opacity: 1; }
.password-toggle { display: grid; flex: 0 0 55px; height: 100%; place-items: center; padding: 0; color: #71808a; border: 0; background: transparent; cursor: pointer; }
.password-toggle svg { width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.form-options { display: flex; align-items: center; justify-content: space-between; margin: 27px 0 33px; }
.remember { display: flex; align-items: center; gap: 11px; color: #656a73; font-size: 16px; font-weight: 500; cursor: pointer; }
.remember input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.remember span { display: block; width: 25px; height: 25px; border: 1.5px solid #8ea4ad; border-radius: 5px; background: white; }
.remember input:checked + span { border-color: var(--cyan); background: var(--cyan); box-shadow: inset 0 0 0 5px white; }
.remember input:focus-visible + span { outline: 3px solid rgb(8 189 208 / .25); outline-offset: 2px; }
.link-button, .register-row button { padding: 0; color: var(--cyan-deep); border: 0; background: transparent; font-weight: 700; cursor: pointer; }
.link-button { font-size: 16px; }
.login-error { margin: -18px 0 14px; padding: 10px 12px; color: #8c2f25; border-radius: 10px; background: #fce2dd; font-size: 14px; }
.login-submit, .admin-button { width: 100%; height: 57px; border: 0; border-radius: 14px; font-size: 19px; cursor: pointer; }
.login-submit { color: white; background: linear-gradient(90deg, #08b9cc, #02c5d3); font-weight: 800; box-shadow: 0 8px 18px rgb(0 189 208 / .13); }
.login-submit:hover { filter: brightness(.96); }
.login-submit:disabled { opacity: .62; cursor: wait; }
.admin-button { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 20px; color: #101b20; background: linear-gradient(90deg, #cef5f8, #ddf9fb); }
.admin-button svg { width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.register-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; margin-top: 34px; color: #73777f; }
.register-row span { height: 1px; background: #d7e4e7; }
.register-row p { margin: 0; font-size: 16px; white-space: nowrap; }
.register-row button { margin-left: 4px; font-size: inherit; }

button:focus-visible { outline: 3px solid rgb(8 189 208 / .28); outline-offset: 3px; }

@media (max-width: 1250px) {
  .login-page { grid-template-columns: 54% 46%; }
  .login-story { padding-inline: 50px 35px; }
  .story-copy p br { display: none; }
  .product-preview { left: 3%; right: 2%; width: 111%; transform: scale(.88); transform-origin: left bottom; }
  .login-panel { padding-inline: 25px; }
  .login-card { padding-inline: 42px; }
}

@media (max-width: 950px) {
  .login-page { display: block; min-height: 100vh; overflow: auto; }
  .login-story { min-height: 440px; padding: 45px 35px; }
  .story-copy { text-align: center; }
  .story-copy h1 { margin-top: 24px; font-size: 48px; }
  .story-copy p { max-width: 650px; margin-inline: auto; font-size: 20px; }
  .pulse-logo--hero { height: 62px; font-size: 58px; }
  .pulse-logo--hero svg { width: 38px; height: 56px; }
  .product-preview { left: 50%; bottom: -35px; width: 650px; height: 300px; transform: translateX(-50%) scale(.68); transform-origin: center bottom; opacity: .72; }
  .login-panel { padding: 65px 22px 35px; }
  .login-card { width: min(100%, 600px); }
}

@media (max-width: 560px) {
  .login-story { min-height: 330px; padding: 32px 20px; }
  .story-copy h1 { margin: 18px 0 7px; font-size: 38px; }
  .story-copy p { font-size: 16px; }
  .pulse-logo--hero { height: 48px; font-size: 45px; }
  .pulse-logo--hero svg { width: 29px; height: 43px; }
  .product-preview { bottom: -42px; transform: translateX(-50%) scale(.48); }
  .login-panel { padding: 58px 14px 22px; }
  .login-card { padding: 30px 22px 26px; border-radius: 27px; }
  .pulse-logo--card { height: 47px; font-size: 45px; }
  .pulse-logo--card svg { width: 29px; height: 43px; }
  .login-card header { margin: 22px 0 27px; }
  .login-card header h2 { font-size: 28px; }
  .login-card header p { font-size: 15px; }
  .input-shell { height: 55px; }
  .input-shell input { font-size: 15px; }
  .field-group > label, .remember, .link-button, .register-row p { font-size: 14px; }
  .form-options { margin: 22px 0 28px; }
  .login-submit, .admin-button { height: 53px; font-size: 17px; }
  .register-row { gap: 10px; margin-top: 28px; }
}

@media (prefers-reduced-motion: reduce) {
  .input-shell { transition: none; }
}
</style>
