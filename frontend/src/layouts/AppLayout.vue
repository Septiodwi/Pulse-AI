<script setup lang="ts">
import { useRouter } from 'vue-router'
import { auth } from '../lib/auth'

const router = useRouter()
async function logout() { await auth.logout(); await router.push('/login') }
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <RouterLink class="pulse-brand" to="/" aria-label="Pulse"><span>pu</span><b>ϟ</b><span>se</span></RouterLink>
      <nav aria-label="Navigasi utama">
        <RouterLink to="/"><i>▦</i><span>Dashboard</span></RouterLink>
        <RouterLink v-if="auth.isAdmin.value" to="/users"><i>♙</i><span>Master User</span></RouterLink>
        <RouterLink v-if="auth.canAccess('accounts')" to="/accounts"><i>▤</i><span>Master Accounts</span></RouterLink>
        <RouterLink to="/profile"><i>◎</i><span>Profil</span></RouterLink>
        <RouterLink v-if="auth.canAccess('products')" to="/products"><i>◇</i><span>Profil Produk</span></RouterLink>
        <RouterLink v-if="auth.canAccess('content')" to="/content" active-class="content-active"><i>✧</i><span>Konten Generator</span></RouterLink>
        <RouterLink v-if="auth.canAccess('content')" to="/calendar" aria-label="Kalender Konten"><i aria-hidden="true">▦</i><span>Kalender Konten</span></RouterLink>
        <RouterLink v-if="auth.canAccess('agent-news')" to="/agent-news"><i>♧</i><span>Agent News</span></RouterLink>
        <RouterLink v-if="auth.canAccess('settings')" to="/settings"><i>⚙</i><span>Settings</span></RouterLink>
      </nav>
      <div class="sidebar-wave" aria-hidden="true"></div>
    </aside>

    <section class="app-workspace">
      <header class="app-topbar">
        <button class="notification-button" type="button" aria-label="Notifikasi">♧<span></span></button>
        <div class="user-menu"><b>{{ auth.user.value?.name?.slice(0, 2).toUpperCase() }}</b><span>{{ auth.user.value?.name }}</span><small>{{ auth.user.value?.role }}</small><button type="button" @click="logout">Keluar</button></div>
      </header>
      <main class="app-content"><RouterView /></main>
    </section>
  </div>
</template>

<style scoped>
.app-shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh;color:#0c2238;background:radial-gradient(circle at 88% 3%,#e8fbff 0,transparent 22%),linear-gradient(135deg,#fff 0%,#f8fcff 48%,#eefaff 100%)}.app-sidebar{position:sticky;top:0;display:flex;height:100vh;flex-direction:column;overflow:hidden;padding:34px 15px 22px;border-right:1px solid #dceaf0;background:#ffffffed}.pulse-brand{display:flex;align-items:center;justify-content:center;margin:0 20px 44px;color:#08bcd2;text-decoration:none;font-family:"Arial Rounded MT Bold","Avenir Next",sans-serif;font-size:2.2rem;font-weight:900;letter-spacing:-.09em}.pulse-brand b{margin:0 -2px;font-size:2rem}.app-sidebar nav{position:relative;z-index:2;display:grid;gap:8px}.app-sidebar nav a{display:flex;align-items:center;gap:14px;padding:13px 18px;color:#37546a;border-radius:999px;text-decoration:none;font-size:.94rem;font-weight:750}.app-sidebar nav a i{width:22px;font-style:normal;font-size:1.15rem;text-align:center}.app-sidebar nav a:hover,.app-sidebar nav a.router-link-exact-active,.app-sidebar nav a.content-active{color:white;background:linear-gradient(100deg,#07aeca,#08c4d4);box-shadow:0 9px 19px #00afc53d}.sidebar-wave{position:absolute;left:-75px;bottom:-105px;width:280px;height:230px;border-radius:45% 55% 0 0;background:linear-gradient(140deg,#89e5f7,#d8f7fc);opacity:.65;transform:rotate(18deg)}.app-workspace{min-width:0}.app-topbar{display:flex;align-items:center;justify-content:flex-end;gap:18px;min-height:72px;padding:12px clamp(22px,4vw,58px)}.notification-button{position:relative;width:42px;height:42px;color:#163851;border:0;background:transparent;font-size:1.45rem}.notification-button span{position:absolute;right:7px;top:6px;width:9px;height:9px;border:2px solid white;border-radius:50%;background:#08b9d0}.user-menu{display:grid;grid-template-columns:42px auto auto auto;align-items:center;gap:10px}.user-menu>b{display:grid;width:42px;height:42px;place-items:center;color:white;border-radius:50%;background:linear-gradient(135deg,#3ac9ec,#20aeda)}.user-menu>span{font-weight:900}.user-menu>small{padding:3px 7px;color:#168097;border-radius:999px;background:#dff8fc}.user-menu>button{padding:7px 10px;color:#50697a;border:0;background:transparent;cursor:pointer}.app-content{padding:0 clamp(22px,4vw,58px) 42px}
@media(max-width:760px){.app-shell{grid-template-columns:1fr}.app-sidebar{position:static;height:auto;padding:14px}.pulse-brand{justify-content:flex-start;margin:0 8px 14px;font-size:1.8rem}.app-sidebar nav{display:flex;overflow-x:auto}.app-sidebar nav a{min-width:max-content;padding:10px 13px}.app-sidebar nav a span{display:none}.sidebar-wave{display:none}.app-topbar{min-height:56px;padding:8px 16px}.user-menu{grid-template-columns:38px auto auto}.user-menu>b{width:38px;height:38px}.user-menu>small{display:none}.user-menu>button{grid-column:3}.app-content{padding:0 14px 28px}}
</style>
