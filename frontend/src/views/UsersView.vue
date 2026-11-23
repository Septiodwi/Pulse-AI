<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { accountName, listAccounts, type TebarAccount } from '../lib/accounts'
import { auth, userModuleLabels } from '../lib/auth'
import { api } from '../lib/api'
import type { User, UserModule, UserRole } from '../types'

const users = ref<User[]>([])
const search = ref('')
const error = ref('')
const loading = ref(true)
const busy = ref(false)
const selectedId = ref<string | null>(null)
const mode = ref<'detail' | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const modules = ref<UserModule[]>([])
const accountIds = ref<string[]>([])
const accountChoice = ref('')
const accounts = ref<TebarAccount[]>([])
const accountsLoading = ref(false)
const accountsError = ref('')
const formError = ref('')

async function openForm() {
  formError.value = ''
  dialog.value?.showModal()
  if (form.role === 'USER') await loadAccounts()
}

async function loadAccounts() {
  if (form.role !== 'USER' || accountsLoading.value) return
  accountsLoading.value = true
  accountsError.value = ''
  try {
    accounts.value = await listAccounts()
  } catch {
    accountsError.value = 'Daftar akun Tebar gagal dimuat.'
  } finally {
    accountsLoading.value = false
  }
}
const role = ref('')
const status = ref('')
const sort = ref('newest')
const page = ref(1)
const pageSize = 6
const roleNames = { ADMIN: 'Admin', USER: 'User' }
const selected = computed(() => users.value.find(user => user.id === selectedId.value))
const activeCount = computed(() => users.value.filter(user => user.isActive).length)
const roleCount = computed(() => new Set(users.value.map(user => user.role)).size)
const filtered = computed(() => {
  const query = search.value.toLowerCase()
  return users.value.filter(user =>
    [user.name, user.email, roleNames[user.role]].some(value => value.toLowerCase().includes(query)) &&
    (!role.value || user.role === role.value) &&
    (!status.value || user.isActive === (status.value === 'active')),
  ).sort((a, b) => sort.value === 'name'
    ? a.name.localeCompare(b.name, 'id')
    : b.createdAt.localeCompare(a.createdAt))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const offset = computed(() => (page.value - 1) * pageSize)
const visibleUsers = computed(() => filtered.value.slice(offset.value, offset.value + pageSize))
watch([search, role, status, sort], () => { page.value = 1 })
watch(pageCount, count => { page.value = Math.min(page.value, count) })

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' })
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase()
}

function show(user: User) {
  selectedId.value = user.id
  mode.value = 'detail'
}

function add() {
  reset()
  selectedId.value = null
  void openForm()
}

function close() {
  if (!busy.value) mode.value = null
}
const editingId = ref<string | null>(null)
const form = reactive({ name: '', email: '', phone: '', password: '', role: 'USER' as UserRole, isActive: true })

async function load() {
  error.value = ''
  try {
    const data = await api<{ users: User[] }>('/users')
    users.value = data.users
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Gagal memuat pengguna'
  } finally {
    loading.value = false
  }
}

function reset() {
  editingId.value = null
  modules.value = []
  accountIds.value = []
  accountChoice.value = ''
  Object.assign(form, { name: '', email: '', phone: '', password: '', role: 'USER', isActive: true })
}

function edit(user: User) {
  editingId.value = user.id
  modules.value = [...(user.access?.modules ?? [])]
  accountIds.value = [...(user.access?.accountIds ?? [])]
  accountChoice.value = user.access ? (accountIds.value.length ? 'selected' : 'none') : ''
  Object.assign(form, { name: user.name, email: user.email, phone: user.phone ?? '', password: '', role: user.role, isActive: user.isActive })
  void openForm()
}

async function save() {
  if (busy.value) return
  formError.value = ''
  if (form.role === 'USER' && (!modules.value.length || !accountChoice.value || (accountChoice.value === 'selected' && !accountIds.value.length))) {
    formError.value = 'Pilih minimal satu modul dan tentukan akses akun.'
    return
  }
  busy.value = true
  try {
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      role: form.role,
      isActive: form.isActive,
      ...(form.role === 'USER' ? {
        access: { modules: modules.value, accountIds: accountChoice.value === 'selected' ? accountIds.value : [] },
      } : {}),
      ...(form.password ? { password: form.password } : {}),
    }
    const { user } = await api<{ user: User }>(editingId.value ? `/users/${editingId.value}` : '/users', {
      method: editingId.value ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    })
    users.value = editingId.value
      ? users.value.map(current => current.id === user.id ? user : current)
      : [...users.value, user]
    dialog.value?.close()
    reset()
    show(user)
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Gagal menyimpan pengguna'
  } finally {
    busy.value = false
  }
}

async function remove(user: User) {
  if (busy.value || !window.confirm(`Nonaktifkan ${user.name}?`)) return
  busy.value = true
  error.value = ''
  try {
    await api(`/users/${user.id}`, { method: 'DELETE' })
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Gagal menonaktifkan pengguna'
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="master-users">
    <header class="users-heading">
      <span>ADMINISTRASI</span>
      <h1>Master User</h1>
      <p>Kelola pengguna, peran, dan akses sistem Pulse.</p>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="users-layout" :class="{ 'has-panel': mode }">
      <section class="users-list" aria-label="Daftar pengguna">
        <div class="user-metrics">
          <article><span>Total Pengguna</span><strong>{{ loading ? '–' : users.length }}</strong></article>
          <article><span>Aktif</span><strong>{{ loading ? '–' : activeCount }}</strong></article>
          <article><span>Tidak Aktif</span><strong>{{ loading ? '–' : users.length - activeCount }}</strong></article>
          <article><span>Role / Peran</span><strong>{{ loading ? '–' : roleCount }}</strong></article>
        </div>
        <div class="user-toolbar">
          <button class="accent" type="button" :disabled="busy" @click="add">+ Tambah Pengguna</button>
          <input v-model.trim="search" type="search" aria-label="Cari pengguna" placeholder="Cari nama, email, atau role..." />
        </div>
        <div class="user-filters">
          <select v-model="role" aria-label="Filter role">
            <option value="">Semua Role</option><option value="ADMIN">Admin</option><option value="USER">User</option>
          </select>
          <select v-model="status" aria-label="Filter status">
            <option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Tidak Aktif</option>
          </select>
          <select v-model="sort" aria-label="Urutkan pengguna">
            <option value="newest">Urutkan: Terbaru</option><option value="name">Urutkan: Nama A–Z</option>
          </select>
        </div>
        <div class="users-table">
          <table>
            <thead><tr><th scope="col">No.</th><th scope="col">Pengguna</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
            <tbody>
              <tr v-for="(user, index) in visibleUsers" :key="user.id" :class="{ selected: mode && selectedId === user.id }">
                <td>{{ offset + index + 1 }}</td>
                <td><span class="identity"><span class="avatar" aria-hidden="true">{{ initials(user.name) }}</span><strong>{{ user.name }}</strong></span></td>
                <td>{{ user.email }}</td>
                <td><span class="pill" :class="{ admin: user.role === 'ADMIN' }">{{ roleNames[user.role] }}</span></td>
                <td><span class="pill" :class="user.isActive ? 'active' : 'inactive'">{{ user.isActive ? 'Aktif' : 'Tidak Aktif' }}</span></td>
                <td><button class="row-action" type="button" :disabled="busy" :aria-label="'Lihat detail ' + user.name" @click="show(user)">•••</button></td>
              </tr>
              <tr v-if="!visibleUsers.length">
                <td colspan="6" class="empty">{{ loading ? 'Memuat pengguna...' : error && !users.length ? 'Daftar pengguna tidak tersedia.' : 'Tidak ada pengguna.' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer v-if="filtered.length" class="users-footer">
          <span aria-live="polite">Menampilkan {{ offset + 1 }}–{{ offset + visibleUsers.length }} dari {{ filtered.length }} pengguna</span>
          <nav v-if="pageCount > 1" aria-label="Halaman pengguna">
            <button type="button" aria-label="Halaman sebelumnya" :disabled="page === 1" @click="page--">‹</button>
            <span>{{ page }} / {{ pageCount }}</span>
            <button type="button" aria-label="Halaman berikutnya" :disabled="page === pageCount" @click="page++">›</button>
          </nav>
        </footer>
      </section>

      <aside v-if="mode" class="user-panel" aria-labelledby="user-panel-title">
        <div class="user-panel-heading">
          <h2 id="user-panel-title">Detail Pengguna</h2>
          <button type="button" aria-label="Tutup panel" :disabled="busy" @click="close">×</button>
        </div>
        <template v-if="selected">
          <div class="identity user-profile">
            <span class="avatar" aria-hidden="true">{{ initials(selected.name) }}</span>
            <div><strong>{{ selected.name }}</strong><span>{{ selected.email }}</span><span class="pill" :class="{ admin: selected.role === 'ADMIN' }">{{ roleNames[selected.role] }}</span></div>
          </div>
          <dl>
            <dt>Status</dt><dd><span class="pill" :class="selected.isActive ? 'active' : 'inactive'">{{ selected.isActive ? 'Aktif' : 'Tidak Aktif' }}</span></dd>
            <template v-if="selected.phone"><dt>Telepon</dt><dd>{{ selected.phone }}</dd></template>
            <dt>Bergabung</dt><dd>{{ dateFormat.format(new Date(selected.createdAt)) }}</dd>
          </dl>
          <div class="user-panel-actions">
            <button v-if="selected.isActive && selected.id !== auth.user.value?.id" class="deactivate" type="button" :disabled="busy" @click="remove(selected)">Nonaktifkan</button>
            <button class="accent" type="button" :disabled="busy" @click="edit(selected)">Edit Pengguna</button>
          </div>
        </template>
      </aside>
    </div>
    <dialog ref="dialog" class="user-dialog" aria-labelledby="user-dialog-title" @cancel="busy && $event.preventDefault()">
      <header class="dialog-heading">
        <div>
          <span class="dialog-symbol" aria-hidden="true">{{ editingId ? '✎' : '+' }}</span>
          <h2 id="user-dialog-title">{{ editingId ? 'Edit Pengguna' : 'Tambah Pengguna' }}</h2>
        </div>
        <button type="button" aria-label="Tutup popup" :disabled="busy" @click="dialog?.close()">×</button>
      </header>
      <form @submit.prevent="save">
        <div class="dialog-body">
          <div class="dialog-fields">
          <label>Nama<input v-model.trim="form.name" required minlength="2" /></label>
          <label>Email<input v-model.trim="form.email" type="email" required /></label>
          <label>Telepon<input v-model.trim="form.phone" type="tel" /></label>
          <label>{{ editingId ? 'Password baru (opsional)' : 'Password' }}<input v-model="form.password" type="password" :required="!editingId" minlength="12" autocomplete="new-password" /></label>
          <label>Role<select v-model="form.role" @change="loadAccounts" :disabled="editingId === auth.user.value?.id"><option value="USER">User</option><option value="ADMIN">Admin</option></select></label>
          <label class="check"><input v-model="form.isActive" type="checkbox" :disabled="editingId === auth.user.value?.id" /> Aktif</label>
          </div>
          <div v-if="form.role === 'USER'" class="access-grid">
            <fieldset>
              <legend>Modul <span>*</span></legend>
              <label v-for="(label, key) in userModuleLabels" :key="key" class="check">
                <input v-model="modules" type="checkbox" :value="key" /> {{ label }}
              </label>
            </fieldset>
            <fieldset>
              <legend>Akses Master Accounts <span>*</span></legend>
              <label class="check"><input v-model="accountChoice" type="radio" value="none" name="account-access" required /> Tanpa akses akun</label>
              <label class="check"><input v-model="accountChoice" type="radio" value="selected" name="account-access" required /> Pilih akun</label>
              <div v-if="accountChoice === 'selected'" class="account-choices">
                <p v-if="accountsLoading" role="status">Memuat akun...</p>
                <p v-else-if="accountsError" role="alert">{{ accountsError }} <button type="button" @click="loadAccounts">Coba lagi</button></p>
                <p v-else-if="!accounts.length">Belum ada akun terhubung.</p>
                <label v-for="account in accounts" :key="account.id" class="check">
                  <input v-model="accountIds" type="checkbox" :value="account.id" /> {{ accountName(account) }}
                </label>
                <label v-for="id in accountIds.filter(id => !accounts.some(account => account.id === id))" :key="id" class="check">
                  <input v-model="accountIds" type="checkbox" :value="id" /> {{ id }}
                </label>
              </div>
            </fieldset>
          </div>
          <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        </div>
        <footer class="dialog-actions">
          <button type="button" :disabled="busy" @click="dialog?.close()">Batal</button>
          <button class="accent" type="submit" :disabled="busy">{{ busy ? 'Menyimpan...' : 'Simpan' }}</button>
        </footer>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.master-users { --border: #dce9f2; --cyan: #007e98; color: #101d35; font-size: .875rem; }
.users-heading { margin-bottom: 26px; }
.users-heading > span { display: block; margin-bottom: 8px; color: #425777; font-size: .72rem; font-weight: 800; letter-spacing: .06em; }
.users-heading h1 { margin-bottom: 9px; font-size: 2rem; line-height: 1.1; }
.users-heading p { margin-bottom: 0; color: #425777; }
.users-layout { display: grid; gap: 20px; align-items: start; }
.users-list { min-width: 0; }
.user-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
.user-metrics article { display: grid; gap: 8px; min-height: 98px; padding: 14px 16px; border: 1px solid #78d9ec; border-radius: 16px; background: linear-gradient(140deg, #f5fdff, #dcf5fb); font-weight: 700; }
.user-metrics article:nth-child(2) { border-color: #ddf5e6; background: linear-gradient(140deg, #f6fff8, #e4f8ea); }
.user-metrics article:nth-child(3) { border-color: #fae5ed; background: linear-gradient(140deg, #fff9fb, #fce9ef); }
.user-metrics article:nth-child(4) { border-color: #ebe5fa; background: linear-gradient(140deg, #fbf9ff, #f0ebfa); }
.user-metrics strong { font-size: 2.2rem; line-height: 1; letter-spacing: -.06em; font-variant-numeric: tabular-nums; }
.user-toolbar, .user-filters, .users-footer, .user-panel-actions, .user-panel-heading { display: flex; align-items: center; gap: 10px; }
.user-toolbar, .user-filters { flex-wrap: wrap; margin-bottom: 12px; }
.user-toolbar input { width: min(100%, 320px); margin-left: auto; }
.user-filters select { width: auto; min-width: 142px; }
.user-filters select:last-child { margin-left: auto; }
.master-users button, .master-users input, .master-users select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 11px; background: #fff; color: inherit; }
.master-users button { font-weight: 750; cursor: pointer; }
.master-users button:hover:not(:disabled) { border-color: var(--cyan); }
.master-users button:disabled { opacity: .5; cursor: default; }
.master-users button.accent { border-color: var(--cyan); background: var(--cyan); color: white; }
.users-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 15px; background: #fff; }
.users-table th { background: #e5f7fc; color: #142640; letter-spacing: 0; text-transform: none; }
.users-table th, .users-table td { padding: 10px 12px; border-color: #edf3f8; }
.users-table tbody tr:last-child td { border-bottom: 0; }
.users-table tbody tr:hover, .users-table tr.selected { background: #f0fbfe; }
.users-table .empty { padding: 24px; text-align: center; color: #425777; }
.identity { display: flex; align-items: center; gap: 10px; }
.avatar { display: grid; flex: none; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #dcf4fa; color: #086681; font-weight: 800; }
.pill { display: inline-block; width: fit-content; padding: 4px 9px; border-radius: 999px; background: #e1f4fe; color: #14558b; font-size: .75rem; font-weight: 800; white-space: nowrap; }
.pill.admin { background: #eee3ff; color: #5630a2; }
.pill.active { background: #d9f8e2; color: #145c34; }
.pill.inactive { background: #fce3eb; color: #a02447; }
.master-users .row-action { min-height: 34px; background: #e0f6fc; }
.users-footer { justify-content: space-between; flex-wrap: wrap; padding: 14px 0; color: #425777; }
.users-footer nav { display: flex; align-items: center; gap: 8px; }
.user-panel { padding: 18px; border: 1px solid var(--border); border-radius: 16px; background: #fff; box-shadow: 0 8px 24px #14324f0d; }
.user-panel-heading { justify-content: space-between; margin-bottom: 16px; }
.user-panel-heading h2 { margin: 0; font-size: 1.15rem; }
.user-profile { margin-bottom: 20px; overflow-wrap: anywhere; }
.user-profile .avatar { width: 58px; height: 58px; font-size: 1.25rem; }
.user-profile > div { display: grid; gap: 4px; }
.user-profile strong { font-size: 1.1rem; }
.user-panel dl { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px 16px; margin: 0; padding: 16px 0; border-top: 1px solid var(--border); }
.user-panel dt { color: #425777; }
.user-panel dd { margin: 0; overflow-wrap: anywhere; font-weight: 700; }
.user-panel-actions { justify-content: flex-end; flex-wrap: wrap; margin-top: 12px; }
.master-users .deactivate { color: #a02447; }
.master-users input[type="checkbox"] { min-height: auto; accent-color: var(--cyan); }
.user-dialog { width: min(660px, calc(100% - 28px)); max-height: calc(100dvh - 28px); padding: 0; border: 1px solid #bde6ef; border-radius: 24px; color: inherit; background: #fff; box-shadow: 0 24px 90px #10264259; }
.user-dialog[open] { display: flex; flex-direction: column; animation: dialog-enter .2s ease-out; }
.user-dialog::backdrop { background: #0b21386b; backdrop-filter: blur(5px); }
.dialog-heading { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #d6edf5; background: linear-gradient(120deg, #dcf8ff, #f7fbff 78%); }
.dialog-heading > div { display: flex; align-items: center; gap: 12px; }
.dialog-heading h2 { margin: 0; font-size: 1.3rem; }
.dialog-symbol { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: #007e98; color: white; font-size: 1.4rem; }
.user-dialog form { display: flex; flex-direction: column; gap: 0; min-height: 0; }
.dialog-body { display: grid; gap: 18px; padding: 20px 22px; overflow: auto; }
.dialog-fields, .access-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.access-grid fieldset { min-width: 0; margin: 0; padding: 10px 12px; border: 1px solid #d6edf5; border-radius: 13px; background: #f5fbfd; }
.access-grid legend { padding: 0 5px; font-weight: 800; }
.access-grid legend span { color: #007e98; }
.access-grid label { padding: 5px 0; overflow-wrap: anywhere; }
.master-users input[type="radio"] { width: auto; min-height: auto; accent-color: var(--cyan); }
.account-choices { max-height: 135px; overflow: auto; margin-top: 5px; padding-left: 9px; border-left: 2px solid #bde6ef; }
.account-choices p, .dialog-body .error { margin: 0; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid #d6edf5; background: #f9fdff; }
@keyframes dialog-enter { from { opacity: 0; transform: translateY(10px) scale(.985); } }
@media (prefers-reduced-motion: reduce) { .user-dialog[open] { animation: none; } }
@media (max-width: 560px) { .dialog-fields, .access-grid { grid-template-columns: 1fr; } }
@media (min-width: 1220px) { .users-layout.has-panel { grid-template-columns: minmax(0, 1fr) minmax(270px, 27%); } }
@media (max-width: 1219px) { .user-panel { grid-row: 1; } }
@media (max-width: 600px) {
  .user-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .user-toolbar input { width: 100%; margin-left: 0; }
  .user-filters select:last-child { margin-left: 0; }
}
</style>
