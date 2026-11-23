<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { auth } from '../lib/auth'
import { accountName, listAccounts } from '../lib/accounts'
import { api } from '../lib/api'
import type { Product } from '../types'

const products = ref<Product[]>([])
const search = ref('')
const accountFilter = ref('')
const loading = ref(true)
const error = ref('')
const selected = ref<Product | null>(null)

const accountLabels = ref(new Map<string, string>())
const linkedAccountName = (id: string) => accountLabels.value.get(id) ?? id
const accounts = computed(() => [...new Set(products.value.flatMap((product) => product.linkedAccounts))].sort())
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return products.value.filter((product) => {
    const matchesSearch = !term || [product.name, product.description, product.productType, product.branding].some((value) => value.toLowerCase().includes(term))
    return matchesSearch && (!accountFilter.value || product.linkedAccounts.includes(accountFilter.value))
  })
})

async function loadProducts() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<{ products: Product[] }>('/products')
    products.value = data.products
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Gagal memuat produk'
  } finally {
    loading.value = false
  }
}

async function remove(product: Product) {
  if (!window.confirm(`Hapus ${product.name}?`)) return
  try {
    await api(`/products/${product.id}`, { method: 'DELETE' })
    products.value = products.value.filter((item) => item.id !== product.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Gagal menghapus produk'
  }
}

onMounted(loadProducts)
onMounted(() => {
  void listAccounts()
    .then((items) => { accountLabels.value = new Map(items.map((account) => [account.id, accountName(account)])) })
    .catch(() => { accountLabels.value = new Map() })
})
</script>

<template>
  <section class="products-page">
    <header class="products-header">
      <div><h1>Brand Profile</h1><p>Kelola profil produk untuk kebutuhan konten dan branding.</p></div>
      <RouterLink class="add-product" to="/products/new"><b>＋</b> Tambah Produk</RouterLink>
    </header>

    <div class="product-panel">
      <div class="product-filters">
        <label class="search-field"><span>⌕</span><input v-model="search" aria-label="Cari produk" placeholder="Cari nama produk, deskripsi, atau brand…" /></label>
        <label class="account-filter"><span>◇</span><select v-model="accountFilter" aria-label="Filter linked akun"><option value="">Semua linked akun</option><option v-for="account in accounts" :key="account" :value="account">{{ linkedAccountName(account) }}</option></select></label>
      </div>
      <p v-if="error" class="product-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="empty-state">Memuat produk…</p>
      <p v-else-if="!filtered.length" class="empty-state">Belum ada profil produk.</p>
      <div v-else class="product-table-wrap">
        <table class="product-table">
          <thead><tr><th>Name</th><th>Img produk</th><th>Base img style</th><th>Deskripsi produk</th><th>Jenis produk</th><th>Branding produk</th><th>Linked akun</th><th>Aksi</th></tr></thead>
          <tbody><tr v-for="product in filtered" :key="product.id">
            <td><strong>{{ product.name }}</strong></td>
            <td><img :src="product.productImage" :alt="`Gambar ${product.name}`" /><small>{{ product.productImageName }}</small></td>
            <td><img :src="product.baseImage" :alt="`Base style ${product.name}`" /><small>{{ product.baseImageName }}</small></td>
            <td><p>{{ product.description }}</p></td><td><p>{{ product.productType }}</p></td><td><p>{{ product.branding }}</p></td>
            <td><div class="account-chips"><span v-for="account in product.linkedAccounts" :key="account">{{ linkedAccountName(account) }}</span><small v-if="!product.linkedAccounts.length">—</small></div></td>
            <td><div class="product-actions"><RouterLink :to="`/products/${product.id}/edit`" aria-label="Edit produk">✎</RouterLink><button type="button" aria-label="Lihat produk" @click="selected = product">◉</button><button v-if="auth.isAdmin.value" class="delete" type="button" aria-label="Hapus produk" @click="remove(product)">♲</button></div></td>
          </tr></tbody>
        </table>
      </div>
    </div>

    <div v-if="selected" class="product-modal" role="dialog" aria-modal="true" aria-label="Detail produk" @click.self="selected = null">
      <article><button class="modal-close" type="button" aria-label="Tutup" @click="selected = null">×</button><div class="modal-images"><img :src="selected.productImage" :alt="selected.name" /><img :src="selected.baseImage" alt="Base image style" /></div><h2>{{ selected.name }}</h2><p>{{ selected.description }}</p><dl><dt>Jenis produk</dt><dd>{{ selected.productType }}</dd><dt>Branding</dt><dd>{{ selected.branding }}</dd><dt>Linked akun</dt><dd>{{ selected.linkedAccounts.map(linkedAccountName).join(', ') || '—' }}</dd></dl></article>
    </div>
  </section>
</template>

<style scoped>
.products-page{color:#0a1b31}.products-header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:24px}.products-header h1{margin:0;font-size:clamp(2.2rem,4vw,3.6rem);letter-spacing:-.055em}.products-header p{margin:5px 0 0;color:#4f6479}.add-product{display:flex;align-items:center;gap:10px;padding:14px 24px;color:white;border-radius:16px;background:linear-gradient(135deg,#05b4ca,#04cad8);box-shadow:0 12px 25px #00abc84d;text-decoration:none;font-weight:900}.add-product b{font-size:1.7rem;font-weight:400}.product-panel{padding:20px;border:1px solid #8eddec;border-radius:24px;background:#ffffffdb;box-shadow:0 18px 45px #16708a12}.product-filters{display:flex;gap:18px;margin-bottom:20px}.search-field,.account-filter{display:flex;grid-template-columns:auto 1fr;align-items:center;gap:10px;padding:0 14px;border:1px solid #c6e8ef;border-radius:14px;background:white}.search-field{width:min(430px,100%)}.account-filter{width:250px}.search-field span,.account-filter span{font-size:1.4rem}.search-field input,.account-filter select{margin:0;padding:13px 0;border:0;outline:0;background:transparent}.product-table-wrap{overflow-x:auto}.product-table{min-width:1320px}.product-table th{padding:14px;color:#0b1a2d;border:0;background:#dcf8fc;text-transform:none;font-size:.82rem;letter-spacing:0}.product-table th:first-child{border-radius:13px 0 0 13px}.product-table th:last-child{border-radius:0 13px 13px 0}.product-table td{max-width:180px;padding:12px;border-bottom:1px solid #d8edf1;vertical-align:middle}.product-table td>strong{display:block;font-size:1rem}.product-table img{display:block;width:112px;height:82px;object-fit:cover;border-radius:14px;background:#e7f8fb}.product-table td small{display:block;max-width:112px;margin-top:5px;overflow:hidden;color:#536b7a;text-overflow:ellipsis;white-space:nowrap}.product-table td p{display:-webkit-box;margin:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-height:1.45}.account-chips{display:flex;flex-wrap:wrap;gap:5px}.account-chips span{padding:6px 9px;border:1px solid #9fe2ec;border-radius:999px;background:#ecfbfd;font-size:.73rem;font-weight:800}.product-actions{display:flex;gap:7px}.product-actions a,.product-actions button{display:grid;width:36px;height:36px;place-items:center;color:#00aec6;border:1px solid #caedf2;border-radius:11px;background:#effbfc;text-decoration:none;cursor:pointer}.product-actions .delete{color:#e53838;background:#fff1f1}.empty-state{padding:70px 20px;color:#66808f;text-align:center}.product-error{padding:12px;color:#a91f2c;border-radius:10px;background:#ffe7e9}.product-modal{position:fixed;z-index:200;inset:0;display:grid;padding:20px;place-items:center;background:#05223580}.product-modal article{position:relative;width:min(650px,100%);max-height:90vh;overflow:auto;padding:28px;border-radius:24px;background:white;box-shadow:0 24px 70px #00172555}.modal-close{position:absolute;right:18px;top:14px;border:0;background:transparent;font-size:2rem;cursor:pointer}.modal-images{display:grid;grid-template-columns:1fr 1fr;gap:12px}.modal-images img{width:100%;height:210px;object-fit:cover;border-radius:16px}.product-modal h2{margin:20px 0 8px}.product-modal dl{display:grid;grid-template-columns:120px 1fr;gap:10px;margin-bottom:0}.product-modal dt{font-weight:900}.product-modal dd{margin:0}.product-modal article:focus{outline:none}@media(max-width:760px){.products-header{align-items:flex-start;flex-direction:column}.add-product{width:100%;justify-content:center}.product-filters{flex-direction:column}.search-field,.account-filter{width:100%}.product-panel{padding:12px}.modal-images{grid-template-columns:1fr}.product-modal dl{grid-template-columns:1fr}.product-modal dd{margin-bottom:8px}}
</style>
