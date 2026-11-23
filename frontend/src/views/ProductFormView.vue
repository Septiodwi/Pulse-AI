<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { accountName, listAccounts, platformLogo, platformName, type TebarAccount } from '../lib/accounts'
import { api } from '../lib/api'
import type { Product } from '../types'

const route = useRoute()
const router = useRouter()
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const editing = computed(() => Boolean(id.value))
const saving = ref(false)
const loading = ref(editing.value)
const error = ref('')
const linkedOpen = ref(false)
const multiSelect = ref<HTMLElement | null>(null)
const accounts = ref<TebarAccount[]>([])
const accountOptions = computed(() => accounts.value.filter((account) => account.status === 'active'))
const accountLabels = computed(() => new Map(accounts.value.map((account) => [account.id, accountName(account)])))
const accountsLoading = ref(true)
const accountsError = ref('')
const form = reactive({ name: '', productImage: '', productImageName: '', baseImage: '', baseImageName: '', description: '', productType: '', branding: '', linkedAccounts: [] as string[] })

function closeLinkedAccounts(event: PointerEvent) {
  if (linkedOpen.value && !multiSelect.value?.contains(event.target as Node)) linkedOpen.value = false
}

function readImage(file: File, target: 'product' | 'base') {
  error.value = ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { error.value = 'Gambar harus berformat PNG, JPG, atau WebP'; return }
  if (file.size > 5 * 1024 * 1024) { error.value = 'Ukuran gambar maksimal 5MB'; return }
  const reader = new FileReader()
  reader.onload = () => {
    if (target === 'product') { form.productImage = String(reader.result); form.productImageName = file.name }
    else { form.baseImage = String(reader.result); form.baseImageName = file.name }
  }
  reader.onerror = () => { error.value = 'Gambar gagal dibaca' }
  reader.readAsDataURL(file)
}

function onFile(event: Event, target: 'product' | 'base') {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) readImage(file, target)
}

async function save() {
  if (!form.productImage || !form.baseImage) { error.value = 'Gambar produk dan base image wajib diisi'; return }
  saving.value = true; error.value = ''
  const body = { name: form.name, productImage: form.productImage, productImageName: form.productImageName, baseImage: form.baseImage, baseImageName: form.baseImageName, description: form.description, productType: form.productType, branding: form.branding, linkedAccounts: [...form.linkedAccounts] }
  try {
    await api(editing.value ? `/products/${id.value}` : '/products', { method: editing.value ? 'PATCH' : 'POST', body: JSON.stringify(body) })
    await router.push('/products')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Gagal menyimpan produk' }
  finally { saving.value = false }
}

onMounted(async () => {
  if (!editing.value) return
  try {
    const data = await api<{ product: Product }>(`/products/${id.value}`)
    const product = data.product
    Object.assign(form, { ...product, linkedAccounts: [...product.linkedAccounts] })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Gagal memuat produk' }
  finally { loading.value = false }
})

onMounted(async () => {
  try {
    accounts.value = await listAccounts()
  } catch (cause) {
    accountsError.value = cause instanceof Error ? cause.message : 'Gagal memuat akun Tebar'
  } finally {
    accountsLoading.value = false
  }
})

onMounted(() => document.addEventListener('pointerdown', closeLinkedAccounts))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeLinkedAccounts))
</script>

<template>
  <section class="product-form-page">
    <nav class="breadcrumb"><RouterLink to="/products">Produk</RouterLink><span>›</span><b>{{ editing ? 'Edit Produk' : 'Tambah Produk' }}</b></nav>
    <header><h1>{{ editing ? 'Edit Brand Profile' : 'Tambah Produk Baru' }}</h1><p>Buat profil produk untuk kebutuhan konten, promosi, dan distribusi omnichannel.</p></header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="loading">Memuat produk…</p>
    <form v-else @submit.prevent="save">
      <div class="form-card basic-card"><h2><span>◇</span> Informasi Dasar</h2><label>Nama Produk *<input v-model.trim="form.name" aria-label="Nama Produk" required maxlength="160" /></label>
        <div class="upload-grid"><label class="upload-label">Gambar Produk *<small>Foto utama produk (PNG/JPG/WebP, maks. 5MB)</small><input aria-label="Gambar Produk" type="file" accept="image/png,image/jpeg,image/webp" @change="onFile($event, 'product')" /><span class="image-drop"><img v-if="form.productImage" :src="form.productImage" alt="Preview gambar produk" /><b v-else>＋ Pilih gambar produk</b></span></label><label class="upload-label">Base Image Style *<small>Gambar gaya/template untuk konten (maks. 5MB)</small><input aria-label="Base Image Style" type="file" accept="image/png,image/jpeg,image/webp" @change="onFile($event, 'base')" /><span class="image-drop"><img v-if="form.baseImage" :src="form.baseImage" alt="Preview base image" /><b v-else>＋ Pilih base image</b></span></label></div>
        <aside class="image-note"><strong>ⓘ Keterangan Gambar</strong><p>Gambar Produk: foto asli produk yang jelas dan berkualitas.</p><p>Base Image Style: gaya visual atau template untuk desain konten.</p></aside>
      </div>
      <div class="form-card detail-card"><h2><span>▤</span> Detail Produk</h2><label>Deskripsi Produk *<textarea v-model.trim="form.description" aria-label="Deskripsi Produk" required maxlength="2000" rows="5"></textarea><small>{{ form.description.length }} / 2000</small></label><label>Jenis Produk *<textarea v-model.trim="form.productType" aria-label="Jenis Produk" required maxlength="500" rows="2"></textarea><small>{{ form.productType.length }} / 500</small></label><label>Branding Produk *<textarea v-model.trim="form.branding" aria-label="Branding Produk" required maxlength="500" rows="2"></textarea><small>{{ form.branding.length }} / 500</small></label>
        <div class="linked-field"><span>Linked Akun</span><div ref="multiSelect" class="multi-select" @keydown.esc="linkedOpen = false"><button type="button" aria-label="Pilih linked akun" :aria-expanded="linkedOpen" aria-haspopup="listbox" @click="linkedOpen = !linkedOpen"><span v-if="!form.linkedAccounts.length" class="multi-placeholder">Pilih akun yang terhubung</span><span v-else class="selected-chips"><i v-for="account in form.linkedAccounts" :key="account">{{ accountLabels.get(account) ?? account }}</i></span><strong>⌄</strong></button><div v-if="linkedOpen" class="account-menu" role="listbox" aria-label="Daftar linked akun" aria-multiselectable="true"><p v-if="accountsLoading" role="status">Memuat akun…</p><p v-else-if="accountsError" role="alert">{{ accountsError }}</p><p v-else-if="!accountOptions.length">Belum ada akun aktif.</p><label v-for="account in accountOptions" :key="account.id"><input v-model="form.linkedAccounts" type="checkbox" :value="account.id" /><span class="account-icon"><img v-if="platformLogo(account.platform)" :src="platformLogo(account.platform)" alt="" width="18" height="18" /></span><span><b>{{ accountName(account) }}</b><small>{{ platformName(account.platform) }}{{ account.username ? ` · ${account.username}` : '' }}</small></span><em>✓</em></label></div></div><small>Pilih satu atau beberapa akun.</small></div>
      </div>
      <footer><RouterLink to="/products">Batal</RouterLink><button type="submit" :disabled="saving">{{ saving ? 'Menyimpan…' : '▣ Simpan Produk' }}</button></footer>
    </form>
  </section>
</template>

<style scoped>
.product-form-page{color:#091b2e}.breadcrumb{display:flex;gap:9px;margin-bottom:24px;color:#526c7a}.breadcrumb a{color:#526c7a;text-decoration:none}.product-form-page>header{margin-bottom:26px}.product-form-page h1{margin:0;font-size:clamp(2.1rem,4vw,3.2rem);letter-spacing:-.05em}.product-form-page>header p{margin:6px 0 0;color:#536b78}.product-form-page form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:0;border:1px solid #a4e4ee;border-radius:24px;background:#ffffffd9;box-shadow:0 18px 45px #15758e12}.form-card{padding:24px}.basic-card{border-right:1px solid #cfeaf0}.form-card h2{display:flex;align-items:center;gap:10px;margin:0 0 20px;font-size:1.25rem}.form-card h2 span{display:grid;width:36px;height:36px;place-items:center;color:#02bdd2;border-radius:50%;background:#dff9fc}.form-card label{margin-bottom:17px;color:#122c3c;font-weight:850}.form-card input,.form-card textarea{padding:13px 14px;border:1px solid #c9e0e7;border-radius:13px;resize:vertical}.form-card label>small{justify-self:end;color:#687e89;font-weight:500}.upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.upload-label input{position:absolute;width:1px;height:1px;opacity:0}.upload-label>small{justify-self:start}.image-drop{display:grid;min-height:245px;margin-top:10px;overflow:hidden;place-items:center;color:#00acc3;border:1px dashed #9cdae5;border-radius:18px;background:linear-gradient(145deg,#fafdfe,#e8fbfd);cursor:pointer}.image-drop img{width:100%;height:245px;object-fit:contain;background:white}.image-note{margin-top:10px;padding:16px;color:#345363;border-radius:16px;background:linear-gradient(135deg,#e3f9fc,#f5fdfe)}.image-note strong{color:#123040}.image-note p{margin:7px 0 0;font-size:.83rem}.detail-card label small{margin-top:4px}.form-card textarea{font:inherit}.linked-field{display:grid;gap:7px;color:#122c3c;font-size:.88rem;font-weight:850}.linked-field>small{color:#687e89;font-weight:500}.multi-select>button{display:flex;width:100%;min-height:50px;align-items:center;justify-content:space-between;gap:12px;padding:8px 13px;color:#122c3c;border:1px solid #c9e0e7;border-radius:13px;background:white;text-align:left;cursor:pointer}.multi-placeholder{color:#758892;font-weight:500}.selected-chips{display:flex;flex-wrap:wrap;gap:6px}.selected-chips i{padding:6px 9px;color:#08788a;border-radius:999px;background:#dff8fc;font-style:normal;font-size:.76rem}.selected-chips b{margin-left:4px}.account-menu{display:grid;max-height:290px;overflow:auto;margin-top:7px;padding:7px;border:1px solid #bce4eb;border-radius:15px;background:white;box-shadow:0 12px 30px #173d4d1c}.account-menu label{display:grid;grid-template-columns:auto 36px 1fr auto;gap:9px;align-items:center;margin:0;padding:10px;border-radius:10px;cursor:pointer}.account-menu label:hover{background:#edfafd}.account-menu input{width:17px;height:17px;margin:0;accent-color:#05b8cd}.account-menu p{margin:8px}.account-icon img{filter:invert(1)}.account-icon{display:grid;width:34px;height:34px;place-items:center;color:white;border-radius:10px;background:#06b8cc;font-weight:900}.account-menu label span:nth-of-type(2){display:grid}.account-menu label small{justify-self:start;color:#71858f;font-size:.7rem;font-weight:500}.account-menu em{display:none;color:#00afc5;font-style:normal;font-weight:900}.account-menu input:checked~em{display:block}.product-form-page footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:14px;padding:20px 24px;border-top:1px solid #d6edf1}.product-form-page footer a,.product-form-page footer button{min-width:150px;padding:13px 20px;border-radius:14px;text-align:center;text-decoration:none;font-weight:900}.product-form-page footer a{color:#60737d;border:1px solid #06b8ce;background:white}.product-form-page footer button{color:white;border:0;background:linear-gradient(135deg,#03b6cc,#05cbd8);box-shadow:0 10px 20px #00abc43d;cursor:pointer}.product-form-page footer button:disabled{opacity:.6}.form-error{padding:13px;color:#a41e2d;border-radius:12px;background:#ffe5e8}@media(max-width:1100px){.product-form-page form{grid-template-columns:1fr}.basic-card{border-right:0;border-bottom:1px solid #cfeaf0}}@media(max-width:620px){.form-card{padding:18px}.upload-grid{grid-template-columns:1fr}.image-drop,.image-drop img{height:210px;min-height:210px}.product-form-page footer{flex-direction:column}.product-form-page footer a,.product-form-page footer button{width:100%}}
</style>
