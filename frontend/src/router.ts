import { createRouter, createWebHistory } from 'vue-router'
import type { UserModule } from './types'
import { auth } from './lib/auth'

declare module 'vue-router' {
  interface RouteMeta {
    module?: UserModule
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue') },
    {
      path: '/',
      component: () => import('./layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('./views/DashboardView.vue') },
        { path: 'users', component: () => import('./views/UsersView.vue'), meta: { admin: true } },
        { path: 'profile', component: () => import('./views/ProfileView.vue') },
        { path: 'accounts', component: () => import('./views/AccountsView.vue'), meta: { module: 'accounts' } },
        { path: 'products', component: () => import('./views/ProductsView.vue'), meta: { module: 'products' } },
        { path: 'products/new', component: () => import('./views/ProductFormView.vue'), meta: { module: 'products' } },
        { path: 'products/:id/edit', component: () => import('./views/ProductFormView.vue'), meta: { module: 'products' } },
        { path: 'agent-news', component: () => import('./views/AgentNewsView.vue'), meta: { module: 'agent-news' } },
        { path: 'agent-news/:id', component: () => import('./views/AgentNewsDetailView.vue'), meta: { module: 'agent-news' } },
        { path: 'content', component: () => import('./views/ContentView.vue'), meta: { module: 'content' } },
        { path: 'calendar', component: () => import('./views/CalendarView.vue'), meta: { module: 'content' } },
        { path: 'content/new', component: () => import('./views/ContentView.vue'), meta: { admin: true, module: 'content' } },
        { path: 'settings', component: () => import('./views/SettingsView.vue'), meta: { module: 'settings' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth && !auth.state.ready) await auth.load()
  if (to.meta.requiresAuth && !auth.state.user) return '/login'
  if (to.path === '/login' && auth.state.user) return '/'
  if (to.meta.module && !auth.canAccess(to.meta.module)) return '/'
  if (to.meta.admin && auth.state.user?.role !== 'ADMIN') return '/'
})
