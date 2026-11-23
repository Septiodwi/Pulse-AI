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
        <RouterLink to="/"><i aria-hidden="true">▦</i><span>Dashboard</span></RouterLink>
        <RouterLink v-if="auth.isAdmin.value" to="/users"><i aria-hidden="true">♙</i><span>Management User</span></RouterLink>
        <RouterLink v-if="auth.canAccess('accounts')" to="/accounts"><i aria-hidden="true">▤</i><span>Social Media Account</span></RouterLink>
        <RouterLink to="/profile"><i aria-hidden="true">◎</i><span>Management Account</span></RouterLink>
        <RouterLink v-if="auth.canAccess('products')" to="/products"><i aria-hidden="true">◇</i><span>Brand Profile</span></RouterLink>
        <RouterLink v-if="auth.canAccess('content')" to="/content" active-class="content-active"><i aria-hidden="true">✧</i><span>Content Idea Generator</span></RouterLink>
        <RouterLink v-if="auth.canAccess('content')" to="/calendar" aria-label="Content Plan"><i aria-hidden="true">▦</i><span>Content Plan</span></RouterLink>
        <RouterLink v-if="auth.canAccess('agent-news')" to="/agent-news"><i aria-hidden="true">♧</i><span>AI Content Intelligence</span></RouterLink>
        <RouterLink v-if="auth.canAccess('settings')" to="/settings"><i aria-hidden="true">⚙</i><span>Synchronize</span></RouterLink>
      </nav>
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
.app-shell{display:grid;grid-template-columns:254px minmax(0,1fr);min-height:100vh;color:#0c2238;background:radial-gradient(circle at 88% 3%,#e8fbff 0,transparent 22%),linear-gradient(135deg,#fff 0%,#f8fcff 48%,#eefaff 100%)}
.app-sidebar{
  position:sticky;
  top:0;
  height:100dvh;
  overflow-y:auto;
  padding:28px 16px;
  border-right:1px solid #dceaf0;
  background:linear-gradient(165deg,#fff 52%,#edfaff);
}
.pulse-brand{display:flex;align-items:center;justify-content:flex-start;margin:0 12px 24px;color:#08bcd2;text-decoration:none;font-family:"Arial Rounded MT Bold","Avenir Next",sans-serif;font-size:2.2rem;font-weight:900;letter-spacing:-.09em}
.pulse-brand b{margin:0 -2px;font-size:2rem}
.app-sidebar nav{display:grid;gap:5px;padding-top:12px;border-top:1px solid #dceaf0}
.app-sidebar nav a{
  display:grid;
  grid-template-columns:30px minmax(0,1fr);
  align-items:center;
  gap:10px;
  min-height:46px;
  padding:7px 10px;
  color:#37546a;
  border-radius:12px;
  text-decoration:none;
  font-size:.875rem;
  font-weight:750;
  line-height:1.3;
}
.app-sidebar nav a i{display:grid;place-items:center;height:30px;border-radius:8px;background:#edf6fa;font-style:normal;font-size:1.1rem}
.app-sidebar nav a:hover{background:#f0f8fb}
.app-sidebar nav a.router-link-exact-active,.app-sidebar nav a.content-active{color:#075464;background:#dff7fb;box-shadow:inset 3px 0 #07aeca}
.app-sidebar nav a.router-link-exact-active i,.app-sidebar nav a.content-active i{background:#c4edf4}
.app-sidebar a:focus-visible{outline:2px solid #087a91;outline-offset:-2px}
.app-workspace{min-width:0}.app-topbar{display:flex;align-items:center;justify-content:flex-end;gap:18px;min-height:72px;padding:12px clamp(22px,4vw,58px)}.notification-button{position:relative;width:42px;height:42px;color:#163851;border:0;background:transparent;font-size:1.45rem}.notification-button span{position:absolute;right:7px;top:6px;width:9px;height:9px;border:2px solid white;border-radius:50%;background:#08b9d0}.user-menu{display:grid;grid-template-columns:42px auto auto auto;align-items:center;gap:10px}.user-menu>b{display:grid;width:42px;height:42px;place-items:center;color:white;border-radius:50%;background:linear-gradient(135deg,#3ac9ec,#20aeda)}.user-menu>span{font-weight:900}.user-menu>small{padding:3px 7px;color:#168097;border-radius:999px;background:#dff8fc}.user-menu>button{padding:7px 10px;color:#50697a;border:0;background:transparent;cursor:pointer}.app-content{padding:0 clamp(22px,4vw,58px) 42px}
@media(max-width:760px){.app-shell{grid-template-columns:1fr}.app-sidebar{position:static;height:auto;padding:14px}.pulse-brand{justify-content:flex-start;margin:0 8px 14px;font-size:1.8rem}.app-sidebar nav{display:flex;overflow-x:auto;padding-bottom:6px}.app-sidebar nav a{grid-template-columns:30px auto;flex:none}.app-topbar{min-height:56px;padding:8px 16px}.user-menu{grid-template-columns:38px auto auto}.user-menu>b{width:38px;height:38px}.user-menu>small{display:none}.user-menu>button{grid-column:3}.app-content{padding:0 14px 28px}}
</style>
