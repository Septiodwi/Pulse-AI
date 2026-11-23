import { computed, reactive } from 'vue'
import type { User, UserModule } from '../types'
import { api } from './api'

export const userModuleLabels: Record<UserModule, string> = {
  accounts: 'Master Accounts',
  products: 'Profil Produk',
  'agent-news': 'Agent News',
  content: 'Konten Generator',
  settings: 'Settings',
}

const state = reactive<{ user: User | null; ready: boolean }>({ user: null, ready: false })

export const auth = {
  state,
  user: computed(() => state.user),
  isAdmin: computed(() => state.user?.role === 'ADMIN'),
  canAccess(module: UserModule) {
    const user = state.user
    return user?.role === 'ADMIN' || user?.access?.modules.includes(module) === true
  },
  async load() {
    try {
      const data = await api<{ user: User }>('/auth/me')
      state.user = data.user
    } catch {
      state.user = null
    } finally {
      state.ready = true
    }
  },
  async login(email: string, password: string) {
    const data = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    state.user = data.user
    state.ready = true
  },
  async logout() {
    await api<void>('/auth/logout', { method: 'POST' })
    state.user = null
  },
  setUser(user: User) {
    state.user = user
  },
}
