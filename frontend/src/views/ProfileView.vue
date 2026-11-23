<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError, api } from '../lib/api'
import { auth, userModuleLabels } from '../lib/auth'
import type { User } from '../types'

const tabs = [
  { id: 'account', label: 'Akun Saya', icon: '◎' },
  { id: 'access', label: 'Tim & Akses', icon: '♙' },
  { id: 'security', label: 'Keamanan', icon: '◇' },
] as const
const tab = ref<(typeof tabs)[number]['id']>('account')
const message = ref('')
const error = ref('')
const loading = ref(true)
const loaded = ref(false)
const busy = ref(false)
const user = auth.user
const profile = reactive({ name: '', phone: '' })
const passwords = reactive({ currentPassword: '', newPassword: '' })
const initials = computed(() => user.value?.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase())
const role = computed(() => user.value?.role === 'ADMIN' ? 'Admin' : 'User')
const modules = computed(() => Object.entries(userModuleLabels)
  .filter(([key]) => auth.canAccess(key as keyof typeof userModuleLabels))
  .map(([, label]) => label))
const accountCount = computed(() => user.value?.role === 'ADMIN' ? 'Semua' : user.value?.access?.accountIds.length ?? 0)
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })

function formatDate(value?: string) {
  const date = new Date(value ?? '')
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : '—'
}

function applyUser(next: User) {
  auth.setUser(next)
  profile.name = next.name
  profile.phone = next.phone ?? ''
}

async function loadProfile() {
  loading.value = true
  error.value = ''
  try {
    applyUser((await api<{ user: User }>('/profile', { cache: 'no-store' })).user)
    loaded.value = true
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      window.location.replace('/login')
      return
    }
    error.value = cause instanceof Error ? cause.message : 'Gagal memuat profil'
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)

async function submit(action: 'profile' | 'password') {
  if (busy.value || !loaded.value) return
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    if (action === 'profile') {
      const { user: updated } = await api<{ user: User }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: profile.name.trim(), phone: profile.phone.trim() || null }),
      })
      applyUser(updated)
      message.value = 'Profil tersimpan'
    } else {
      await api('/profile/password', { method: 'PUT', body: JSON.stringify(passwords) })
      auth.state.user = null
      window.location.assign('/login')
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Perubahan gagal disimpan'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-header">
      <h1><span class="heading-icon" aria-hidden="true">◎</span> Profil</h1>
      <p>Kelola informasi akun, akses, dan keamanan Anda.</p>
    </header>

    <p v-if="loading" role="status">Memuat profil…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading" type="button" class="profile-button" @click="loadProfile">Coba lagi</button>
    <template v-if="loaded && user">
      <nav class="profile-nav" aria-label="Bagian profil">
        <button v-for="item in tabs" :key="item.id" type="button" :aria-pressed="tab === item.id"
          @click="tab = item.id; message = ''; error = ''">
          <span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}
        </button>
      </nav>
      <p v-if="message" class="success" role="status">{{ message }}</p>

      <div class="profile-layout">
        <aside class="profile-overview" aria-label="Ringkasan akun">
          <section class="profile-card identity">
            <div class="profile-cover" aria-hidden="true"></div>
            <div class="profile-avatar" aria-hidden="true">{{ initials }}</div>
            <h2>{{ user.name }}</h2>
            <p>{{ user.email }}</p>
            <span class="role-badge">{{ role }}</span>
            <dl class="account-metrics">
              <div><dd>{{ modules.length }}</dd><dt>Modul</dt></div>
              <div><dd>{{ accountCount }}</dd><dt>Akses akun</dt></div>
              <div><dd>{{ user.isActive ? 'Aktif' : 'Nonaktif' }}</dd><dt>Status</dt></div>
            </dl>
          </section>
          <section v-if="auth.canAccess('accounts')" class="profile-card linked-accounts">
            <h2>Akun Terhubung</h2>
            <RouterLink to="/accounts">Kelola <span aria-hidden="true">→</span></RouterLink>
          </section>
        </aside>

        <section v-if="tab === 'account'" class="profile-card profile-details">
          <form @submit.prevent="submit('profile')">
            <div class="details-heading">
              <h2><span aria-hidden="true">◎</span> Informasi Akun</h2>
              <button class="profile-button" type="submit" :disabled="busy">Simpan Perubahan</button>
            </div>
            <div class="details-grid">
              <label>Nama Lengkap <span class="required">*</span><input v-model="profile.name" autocomplete="name" required minlength="2" maxlength="120" :disabled="busy" /></label>
              <label>Email<input :value="user.email" type="email" readonly /></label>
              <label>Nomor Telepon<input v-model="profile.phone" type="tel" autocomplete="tel" maxlength="30" :disabled="busy" /></label>
              <label>Peran<input :value="role" readonly /></label>
              <label>Akun Dibuat<input :value="formatDate(user.createdAt)" readonly /></label>
              <label>Terakhir Diperbarui<input :value="formatDate(user.updatedAt)" readonly /></label>
            </div>
          </form>
        </section>

        <section v-else-if="tab === 'access'" class="profile-card profile-details">
          <div class="details-heading">
            <h2><span aria-hidden="true">♙</span> Tim &amp; Akses</h2>
            <RouterLink v-if="auth.isAdmin.value" class="profile-button" to="/users">Master User</RouterLink>
          </div>
          <h3>Modul yang dapat diakses</h3>
          <ul v-if="modules.length" class="module-list">
            <li v-for="module in modules" :key="module" class="role-badge">{{ module }}</li>
          </ul>
          <p v-else>Belum ada modul yang diberikan.</p>
          <p>Akses akun <strong>{{ accountCount }}</strong></p>
        </section>

        <section v-else class="profile-card profile-details">
          <form @submit.prevent="submit('password')">
            <div class="details-heading"><h2><span aria-hidden="true">◇</span> Ganti Password</h2></div>
            <div class="details-grid">
              <label>Password saat ini<input v-model="passwords.currentPassword" type="password" autocomplete="current-password" required maxlength="200" :disabled="busy" /></label>
              <label>Password baru<input v-model="passwords.newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="200" aria-describedby="password-rule" :disabled="busy" /></label>
            </div>
            <p id="password-rule">Minimal 12 karakter, huruf besar, huruf kecil, dan angka.</p>
            <button class="profile-button" type="submit" :disabled="busy">Ganti Password</button>
          </form>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  --profile-accent: #007d93;
  --profile-border: #dceaf0;
  --profile-muted: #486278;
}
.profile-header h1 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: clamp(2rem, 4vw, 3rem); }
.heading-icon, .details-heading h2 span {
  display: inline-grid; place-items: center; flex: none; width: 1.5em; height: 1.5em;
  border-radius: 30%; color: var(--profile-accent); background: #dff8fc;
}
.profile-header p, .identity p, #password-rule { color: var(--profile-muted); }
.profile-header p { margin: 8px 0 0; }
.profile-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0; }
.profile-nav button, .profile-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px;
  padding: 10px 18px; border: 1px solid var(--profile-border); border-radius: 999px;
  color: inherit; background: white; font: inherit; font-weight: 750; text-decoration: none; cursor: pointer;
}
.profile-nav button:hover { border-color: var(--profile-accent); }
.profile-nav button[aria-pressed="true"], .profile-button { color: white; background: linear-gradient(105deg, #00748e, #007e90); border-color: transparent; }
.profile-button:disabled { opacity: .65; cursor: wait; }
.profile-layout { display: grid; grid-template-columns: minmax(245px, 1fr) minmax(0, 2.55fr); align-items: start; gap: 20px; }
.profile-overview { min-width: 0; display: grid; gap: 16px; }
.profile-card { border: 1px solid var(--profile-border); border-radius: 22px; background: white; box-shadow: 0 8px 24px #1638510d; }
.identity { text-align: center; overflow: hidden; }
.profile-cover {
  height: 122px;
  background: radial-gradient(ellipse at 19% -45%, #e9fbff 61%, transparent 62%),
    radial-gradient(ellipse at 85% 140%, #d9f7fc 57%, transparent 58%),
    linear-gradient(150deg, #d2f6ff, #a8e4f5);
}
.profile-avatar {
  position: relative; display: grid; place-items: center; width: 100px; height: 100px;
  margin: -64px auto 14px; border: 5px solid white; border-radius: 50%;
  color: white; background: linear-gradient(135deg, #0888a4, #006781); font-size: 1.85rem; font-weight: 850;
}
.identity h2, .identity p { margin: 0 14px 6px; overflow-wrap: anywhere; }
.role-badge { display: inline-block; padding: 5px 12px; border-radius: 999px; color: #07546b; background: #e2f6fc; font-weight: 750; }
.account-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 18px 12px 14px; }
.account-metrics div { padding: 9px 3px; border: 1px solid var(--profile-border); border-radius: 12px; }
.account-metrics dd { margin: 0; color: var(--profile-accent); font-weight: 850; }
.account-metrics dt { font-size: .75rem; }
.linked-accounts { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 16px; }
.linked-accounts h2, .linked-accounts a { font-size: .92rem; margin: 0; }
.linked-accounts a { color: var(--profile-accent); font-weight: 750; }
.profile-details { min-width: 0; padding: clamp(16px, 2.3vw, 32px); }
.details-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
.details-heading h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: clamp(1.16rem, 2vw, 1.55rem); }
.details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.details-grid label { display: block; color: inherit; font: inherit; font-weight: 750; min-width: 0; }
.details-grid input { display: block; margin-top: 7px; color: inherit; border-color: var(--profile-border); font-weight: 500; }
.details-grid input[readonly] { background: #f1f7fa; }
.required { color: #ae2533; }
.module-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; list-style: none; }
@media (max-width: 960px) { .details-grid { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .profile-layout { grid-template-columns: 1fr; } }
</style>
