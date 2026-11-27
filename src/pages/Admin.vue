<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import Spinner from '../components/Spinner.vue';
import { adminApi, EVENT_LABELS, type AdminEvent, type AdminUserDetail, type AdminUserRow, type Overview, type Suspect } from '../lib/adminApi';
import { formatPhone } from '../lib/format';
import { getProvider } from '../lib/providers';
import { session } from '../lib/session';
import { toast } from '../lib/toast';

/**
 * Back-office, ouvert par Ctrl+Maj+A (pas d'adresse). Réservé aux numéros de ADMIN_PHONES : le serveur refuse les autres.
 * Vue d'ensemble · Suspects · Utilisateurs · Journal
 */
const emit = defineEmits<{ close: [] }>();
type Tab = 'overview' | 'suspects' | 'users' | 'events';
const tab = ref<Tab>('overview');
const error = ref<string | null>(null);

// ---------- Format ----------
const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
function ago(iso: string | null): string {
  if (!iso) return 'jamais';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
const eventLabel = (t: string) => EVENT_LABELS[t] ?? t;
const who = (x: { username?: string | null; phone?: string | null }) => (x.username ? `@${x.username}` : x.phone ? formatPhone(x.phone) : '—');
function eventDetail(e: AdminEvent): string {
  const m = e.meta ?? {};
  if (e.type === 'contacts_match') return `${m.count} numéros, ${m.hits} trouvés`;
  if (e.type === 'search') return `« ${e.target} » → ${m.results} résultat(s)`;
  if (e.type === 'profile_view') return `@${e.target}`;
  if (e.type.startsWith('alias_')) return `${getProvider(e.target).name} · ${m.value ?? ''}`;
  if (e.type === 'otp_request' || e.type === 'otp_fail' || e.type === 'signup') return e.target ? formatPhone(e.target) : '';
  if (e.type === 'admin_block') return String(m.reason ?? '');
  return e.target ?? '';
}

// ---------- Vue d'ensemble ----------
const overview = ref<Overview | null>(null);
const maxDay = computed(() => Math.max(1, ...(overview.value?.days ?? []).flatMap((d) => [d.active, d.signups])));
const share = (n: number, list: { n: number }[]) => `${Math.round((n / Math.max(1, ...list.map((x) => x.n))) * 100)}%`;

async function loadOverview() {
  overview.value = await adminApi.overview();
}

// ---------- Suspects ----------
const suspectStatus = ref<Suspect['status']>('open');
const suspects = ref<Suspect[] | null>(null);
async function loadSuspects() {
  suspects.value = null;
  suspects.value = await adminApi.suspects(suspectStatus.value);
}
async function setSuspect(s: Suspect, status: 'open' | 'cleared') {
  await adminApi.setSuspect(s.id, status);
  toast(status === 'cleared' ? 'Classé : rien à signaler' : 'Rouvert');
  await loadSuspects();
}

// ---------- Utilisateurs ----------
const userQuery = ref('');
const users = ref<AdminUserRow[] | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
async function loadUsers() {
  users.value = await adminApi.users(userQuery.value);
}
watch(userQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void run(loadUsers), 300);
});

// ---------- Fiche d'un utilisateur ----------
const detail = ref<AdminUserDetail | null>(null);
const detailOpen = ref(false);
const blockReason = ref('');
async function openUser(id: string | null) {
  if (!id) return;
  detailOpen.value = true;
  detail.value = null;
  blockReason.value = '';
  await run(async () => {
    detail.value = await adminApi.user(id);
  });
}
async function block() {
  if (!detail.value) return;
  await run(async () => {
    await adminApi.block(detail.value!.user.id, blockReason.value);
    toast('Compte bloqué');
    await openUser(detail.value!.user.id);
  });
}
async function unblock() {
  if (!detail.value) return;
  await run(async () => {
    await adminApi.unblock(detail.value!.user.id);
    toast('Compte débloqué');
    await openUser(detail.value!.user.id);
  });
}

// ---------- Journal ----------
const eventType = ref('');
const eventIp = ref('');
const events = ref<AdminEvent[] | null>(null);
async function loadEvents() {
  events.value = null;
  events.value = await adminApi.events({ type: eventType.value, ip: eventIp.value.trim() });
}
function filterIp(ip: string | null) {
  if (!ip) return;
  detailOpen.value = false;
  eventIp.value = ip;
  eventType.value = '';
  tab.value = 'events';
}

// ---------- Chargement ----------
async function run(task: () => Promise<void>) {
  error.value = null;
  try {
    await task();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const loaders: Record<Tab, () => Promise<void>> = { overview: loadOverview, suspects: loadSuspects, users: loadUsers, events: loadEvents };
const refresh = () => run(loaders[tab.value]);
watch(tab, refresh);
watch([suspectStatus], () => run(loadSuspects));
watch([eventType], () => run(loadEvents));

onMounted(async () => {
  if (!session.user?.is_admin) return emit('close');
  await refresh();
});
</script>

<template>
  <main class="admin">
    <header class="adm-head">
      <button type="button" class="icon-btn" aria-label="Fermer le back-office (Ctrl+Maj+A)" @click="emit('close')"><Icon name="back" :size="22" /></button>
      <h1>Back-office</h1>
      <span class="grow" />
      <button type="button" class="btn secondary adm-refresh" @click="refresh">Actualiser</button>
    </header>

    <nav class="adm-tabs" aria-label="Sections">
      <button type="button" :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Vue d'ensemble</button>
      <button type="button" :class="{ on: tab === 'suspects' }" @click="tab = 'suspects'">
        Suspects <span v-if="overview?.content.open_suspects" class="count">{{ overview.content.open_suspects }}</span>
      </button>
      <button type="button" :class="{ on: tab === 'users' }" @click="tab = 'users'">Utilisateurs</button>
      <button type="button" :class="{ on: tab === 'events' }" @click="tab = 'events'">Journal</button>
    </nav>

    <p v-if="error" class="note warn">{{ error }}</p>

    <!-- ===== Vue d'ensemble ===== -->
    <section v-if="tab === 'overview'">
      <Spinner v-if="!overview" />
      <template v-else>
        <div class="adm-tiles">
          <div class="adm-tile"><span>Inscrits</span><strong>{{ overview.users.total }}</strong><small>+{{ overview.users.new_today }} aujourd'hui · +{{ overview.users.new_7d }} sur 7 j</small></div>
          <div class="adm-tile"><span>Actifs 24 h</span><strong>{{ overview.users.active_24h }}</strong><small>{{ overview.users.active_7d }} sur 7 j · {{ overview.users.active_30d }} sur 30 j</small></div>
          <div v-if="overview.site" class="adm-tile">
            <span>Visites de la vitrine</span><strong>{{ overview.site.visits_7d }}</strong>
            <small>
              sur 7 j · {{ overview.site.visitors_7d }} visiteur(s) · {{ overview.site.visits_today }} aujourd'hui ·
              {{ overview.site.cta_7d }} clic(s) « Créer mon compte »
              <template v-if="overview.site.visitors_7d"> ({{ Math.round((overview.site.cta_7d / overview.site.visitors_7d) * 100) }} %)</template>
            </small>
          </div>
          <div class="adm-tile"><span>Comptes ajoutés</span><strong>{{ overview.content.aliases }}</strong><small>{{ overview.content.profiles }} profils créés</small></div>
          <button type="button" class="adm-tile warn" @click="tab = 'suspects'">
            <span>Suspects à voir</span><strong>{{ overview.content.open_suspects }}</strong><small>{{ overview.users.blocked }} compte(s) bloqué(s)</small>
          </button>
        </div>

        <div class="adm-card">
          <div class="row-between">
            <h2>14 derniers jours</h2>
            <span class="adm-legend"><i class="dot a" /> Actifs <i class="dot b" /> Inscriptions</span>
          </div>
          <div class="adm-bars">
            <div v-for="d in overview.days" :key="d.day" class="adm-bar" :title="`${dateTime(d.day).slice(0, 5)} : ${d.active} actifs, ${d.signups} inscriptions`">
              <div class="stack-bars">
                <span class="b a" :style="{ height: `${(d.active / maxDay) * 100}%` }" />
                <span class="b b2" :style="{ height: `${(d.signups / maxDay) * 100}%` }" />
              </div>
              <small>{{ new Date(d.day).getDate() }}</small>
            </div>
          </div>
        </div>

        <div class="adm-grid">
          <div v-if="overview.sources" class="adm-card">
            <h2>D'où viennent les visiteurs (7 j)</h2>
            <p v-if="!overview.sources.length" class="muted small">Pas encore de visite. Partage teliyaa.com/?src=linkedin pour suivre une source.</p>
            <div v-for="s in overview.sources" :key="s.key" class="adm-hbar">
              <span>{{ s.key }}</span><i :style="{ width: share(s.n, overview.sources) }" /><b>{{ s.n }}</b>
            </div>
            <p v-if="overview.days.some((d) => d.visits)" class="muted small" style="margin-top: 8px">
              Par jour :
              <template v-for="(d, i) in overview.days.slice(-7)" :key="d.day">{{ i ? ' · ' : '' }}{{ new Date(d.day).getDate() }} → {{ d.visits ?? 0 }}</template>
            </p>
          </div>
          <div class="adm-card">
            <h2>Appareils (30 j)</h2>
            <p v-if="!overview.devices.length" class="muted small">Pas encore de données.</p>
            <div v-for="d in overview.devices" :key="d.key" class="adm-hbar">
              <span>{{ d.key }}</span><i :style="{ width: share(d.n, overview.devices) }" /><b>{{ d.n }}</b>
            </div>
          </div>
          <div class="adm-card">
            <h2>Comptes par établissement</h2>
            <div v-for="p in overview.providers" :key="p.key" class="adm-hbar">
              <span>{{ getProvider(p.key).name }}</span><i :style="{ width: share(p.n, overview.providers) }" /><b>{{ p.n }}</b>
            </div>
          </div>
          <div class="adm-card">
            <h2>Activité des dernières 24 h</h2>
            <div v-for="e in overview.events24h" :key="e.key" class="adm-hbar">
              <span>{{ eventLabel(e.key) }}</span><i :style="{ width: share(e.n, overview.events24h) }" /><b>{{ e.n }}</b>
            </div>
          </div>
        </div>
        <p class="muted small">{{ overview.users.without_pin }} inscrit(s) n'ont pas encore choisi de code PIN.</p>
      </template>
    </section>

    <!-- ===== Suspects ===== -->
    <section v-else-if="tab === 'suspects'">
      <div class="adm-filters">
        <select v-model="suspectStatus" aria-label="Statut">
          <option value="open">À voir</option>
          <option value="cleared">Classés (rien à signaler)</option>
          <option value="blocked">Bloqués</option>
        </select>
        <span class="muted small">Détection automatique toutes les 10 minutes, sur les dernières 24 h.</span>
      </div>
      <Spinner v-if="!suspects" />
      <p v-else-if="!suspects.length" class="adm-card muted">Rien à signaler pour l'instant.</p>
      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th>Quand</th><th>Règle</th><th>Qui</th><th>Détail</th><th>IP</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="s in suspects" :key="s.id">
              <td class="nowrap">{{ dateTime(s.updated_at) }}</td>
              <td><strong>{{ s.label }}</strong></td>
              <td>
                <button v-if="s.user_id" type="button" class="link-btn" @click="openUser(s.user_id)">{{ who(s) }}</button>
                <span v-else class="muted">Sans compte</span>
                <span v-if="s.blocked_at" class="pill warn">bloqué</span>
              </td>
              <td>{{ s.detail }}</td>
              <td><button v-if="s.ip" type="button" class="link-btn mono" @click="filterIp(s.ip)">{{ s.ip }}</button></td>
              <td class="nowrap">
                <button v-if="s.status === 'open'" type="button" class="btn secondary adm-sm" @click="setSuspect(s, 'cleared')">Rien à signaler</button>
                <button v-else-if="s.status === 'cleared'" type="button" class="btn ghost adm-sm" @click="setSuspect(s, 'open')">Rouvrir</button>
                <button v-if="s.user_id && !s.blocked_at" type="button" class="btn danger adm-sm" @click="openUser(s.user_id)">Voir / bloquer</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===== Utilisateurs ===== -->
    <section v-else-if="tab === 'users'">
      <label class="search adm-search">
        <Icon name="search" />
        <input v-model="userQuery" placeholder="Numéro, @pseudo ou nom" aria-label="Chercher un utilisateur" />
      </label>
      <Spinner v-if="!users" />
      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th>Utilisateur</th><th>Numéro</th><th>Inscrit</th><th>Dernière visite</th><th>Appareil</th><th>IP</th><th>Comptes</th><th>24 h</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="clickable" @click="openUser(u.id)">
              <td>
                <strong>{{ u.full_name ?? '(sans profil)' }}</strong>
                <span class="muted small block">{{ u.username ? `@${u.username}` : '' }}</span>
                <span v-if="u.blocked_at" class="pill warn">bloqué</span>
                <span v-if="u.open_suspects" class="pill warn">suspect</span>
                <span v-if="!u.has_pin" class="pill">sans PIN</span>
              </td>
              <td class="nowrap mono">{{ formatPhone(u.phone) }}</td>
              <td class="nowrap">{{ dateTime(u.created_at) }}</td>
              <td class="nowrap">{{ ago(u.last_seen_at) }}</td>
              <td>{{ u.device ?? '—' }}</td>
              <td class="mono">{{ u.last_ip ?? '—' }}</td>
              <td>{{ u.aliases }}</td>
              <td>{{ u.events_24h }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===== Journal ===== -->
    <section v-else>
      <div class="adm-filters">
        <select v-model="eventType" aria-label="Type d'événement">
          <option value="">Tous les événements</option>
          <option v-for="(label, key) in EVENT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
        <form class="row" @submit.prevent="run(loadEvents)">
          <input v-model="eventIp" class="adm-input" placeholder="Filtrer par IP" aria-label="Adresse IP" />
          <button class="btn secondary adm-sm">Filtrer</button>
          <button v-if="eventIp" type="button" class="btn ghost adm-sm" @click="eventIp = ''; run(loadEvents)">Effacer</button>
        </form>
      </div>
      <Spinner v-if="!events" />
      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th>Quand</th><th>Événement</th><th>Qui</th><th>Détail</th><th>Appareil</th><th>IP</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in events" :key="e.id">
              <td class="nowrap">{{ dateTime(e.created_at) }}</td>
              <td>{{ eventLabel(e.type) }}</td>
              <td>
                <button v-if="e.user_id" type="button" class="link-btn" @click="openUser(e.user_id)">{{ who(e) }}</button>
                <span v-else class="muted">—</span>
              </td>
              <td>{{ eventDetail(e) }}</td>
              <td>{{ e.device }}</td>
              <td><button v-if="e.ip" type="button" class="link-btn mono" @click="eventIp = e.ip ?? ''; run(loadEvents)">{{ e.ip }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===== Fiche utilisateur (panneau latéral) ===== -->
    <div v-if="detailOpen" class="adm-drawer-backdrop" @click.self="detailOpen = false">
      <aside class="adm-drawer" aria-label="Fiche utilisateur">
        <div class="row-between">
          <h2>Fiche utilisateur</h2>
          <button type="button" class="icon-btn" aria-label="Fermer" @click="detailOpen = false">✕</button>
        </div>
        <Spinner v-if="!detail" />
        <template v-else>
          <div class="adm-card">
            <strong style="font-size: 18px">{{ detail.user.full_name ?? '(sans profil)' }}</strong>
            <span class="muted block">{{ detail.user.username ? `@${detail.user.username}` : '' }} · {{ formatPhone(detail.user.phone) }}</span>
            <span class="small block">Inscrit le {{ dateTime(detail.user.created_at) }} · dernière visite {{ ago(detail.user.last_seen_at) }}</span>
            <span class="small block">
              PIN : {{ detail.user.has_pin ? 'oui' : 'non' }}<template v-if="detail.user.pin_failures"> ({{ detail.user.pin_failures }} erreur(s) en cours)</template>
              · Trouvable par pseudo : {{ detail.user.discoverable ? 'oui' : 'non' }} · par numéro : {{ detail.user.findable_by_phone ? 'oui' : 'non' }}
            </span>
          </div>

          <div v-if="detail.user.blocked_at" class="note warn">
            <span>
              <strong>Bloqué</strong> le {{ dateTime(detail.user.blocked_at) }} : {{ detail.user.blocked_reason }}
              <button type="button" class="btn secondary adm-sm" style="margin-top: 8px" @click="unblock">Débloquer</button>
            </span>
          </div>
          <form v-else-if="detail.user.id !== session.user?.id" class="adm-card stack" @submit.prevent="block">
            <strong>Bloquer ce compte</strong>
            <span class="muted small">Déconnecté partout, ne peut plus se reconnecter, son profil devient invisible.</span>
            <input v-model="blockReason" class="adm-input" placeholder="Raison (ex. usurpation, aspiration de profils…)" />
            <button class="btn danger">Bloquer</button>
          </form>

          <h3>Suspicions ({{ detail.suspects.length }})</h3>
          <p v-if="!detail.suspects.length" class="muted small">Aucune.</p>
          <div v-for="s in detail.suspects" :key="s.id" class="adm-line">
            <strong>{{ s.label }}</strong> — {{ s.detail }} <span class="pill">{{ s.status }}</span>
          </div>

          <h3>Appareils et IP ({{ detail.sessions.length }} session(s))</h3>
          <div v-for="(s, i) in detail.sessions" :key="i" class="adm-line">
            {{ s.device ?? 'Inconnu' }} ·
            <button v-if="s.last_ip" type="button" class="link-btn mono" @click="filterIp(s.last_ip)">{{ s.last_ip }}</button>
            · {{ ago(s.last_seen_at) }} · {{ s.pin_ok ? 'déverrouillée' : 'PIN pas encore tapé' }}
          </div>

          <h3>Comptes ({{ detail.aliases.length }})</h3>
          <div v-for="(a, i) in detail.aliases" :key="i" class="adm-line">
            {{ a.label || getProvider(a.provider_id).name }} · <span class="mono">{{ a.value }}</span>
            <span v-if="a.is_primary" class="pill ok">principal</span>
            <span v-if="!a.visible" class="pill">masqué</span>
          </div>

          <h3>Activité (200 derniers événements)</h3>
          <div v-for="e in detail.events" :key="e.id" class="adm-line">
            <span class="muted nowrap">{{ dateTime(e.created_at) }}</span> · <strong>{{ eventLabel(e.type) }}</strong>
            <template v-if="eventDetail(e)"> · {{ eventDetail(e) }}</template>
            <span class="muted small"> · {{ e.device }} · {{ e.ip }}</span>
          </div>
        </template>
      </aside>
    </div>
  </main>
</template>
