<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listAccounts, platformLogo, platformName, type TebarAccount } from '../lib/accounts'

const accounts = ref<TebarAccount[]>([])
const loading = ref(true)
const error = ref('')
const statusLabels = { active: 'Aktif', expired: 'Kedaluwarsa', revoked: 'Dicabut' }
const dateFormat = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    accounts.value = await listAccounts()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Gagal memuat akun Tebar'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="accounts-page">
    <header>
      <h1>Social Media Account</h1>
      <p>Daftar akun yang terhubung ke Tebar.</p>
    </header>
    <div class="accounts-panel" :aria-busy="loading">
      <p v-if="loading" class="empty-state" role="status">Memuat akun…</p>
      <div v-else-if="error" class="empty-state">
        <p role="alert">{{ error }}</p>
        <button type="button" @click="load">Coba lagi</button>
      </div>
      <p v-else-if="!accounts.length" class="empty-state">Belum ada akun terhubung.</p>
      <div v-else class="table-wrap">
        <table aria-label="Akun Tebar">
          <thead><tr><th scope="col">Platform</th><th scope="col">Username</th><th scope="col">Display Name</th><th scope="col">Terhubung (WIB)</th><th scope="col">Status</th></tr></thead>
          <tbody>
            <tr v-for="account in accounts" :key="account.id">
              <td><span class="platform">
                <img v-if="platformLogo(account.platform)" :src="platformLogo(account.platform)" alt="" width="22" height="22" />
                <strong>{{ platformName(account.platform) }}</strong>
              </span></td>
              <td>{{ account.username || '—' }}</td>
              <td>{{ account.display_name || '—' }}</td>
              <td><time :datetime="account.connected_at">{{ dateFormat.format(new Date(account.connected_at)) }}</time></td>
              <td><span class="status" :class="account.status">{{ statusLabels[account.status] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.accounts-page{color:#0a1b31}.accounts-page header{margin-bottom:24px}.accounts-page h1{margin:0;font-size:clamp(2.2rem,4vw,3.6rem);letter-spacing:-.055em}.accounts-page header p{margin:5px 0 0;color:#4f6479}
.accounts-panel{padding:20px;border:1px solid #8eddec;border-radius:24px;background:#ffffffdb;box-shadow:0 18px 45px #16708a12}.table-wrap{overflow-x:auto}table{min-width:640px}
th{padding:14px;color:#0b1a2d;border:0;background:#dcf8fc;text-transform:none;font-size:.82rem;letter-spacing:0}th:first-child{border-radius:13px 0 0 13px}th:last-child{border-radius:0 13px 13px 0}td{padding:12px;border-bottom:1px solid #d8edf1;vertical-align:middle;overflow-wrap:anywhere}
.platform{display:flex;align-items:center;gap:10px}.platform img{flex:none}.status{display:inline-block;padding:6px 10px;border-radius:999px;font-size:.78rem;font-weight:800}
.active{color:#086449;background:#d8f7eb}.expired{color:#805013;background:#fff1cf}.revoked{color:#a91f2c;background:#ffe7e9}
.empty-state{padding:48px 16px;color:#4f6479;text-align:center}.empty-state button{padding:8px 14px;color:#08788a;border:1px solid #9fe2ec;border-radius:12px;background:white;cursor:pointer}
@media(max-width:760px){.accounts-panel{padding:12px}}
</style>
