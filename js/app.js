/* ==========================================================
   Penisbasar – App-Logik
   Alle Daten liegen in einer gemeinsamen Supabase-Datenbank.
   Ablauf wie bei Vinted: Kaufen = reservieren, Bezahlung und
   Übergabe passieren im Spiel, der Verkäufer markiert "verkauft".
   ========================================================== */

/* ---------- 1. Kleine Helfer ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

// Text sicher in HTML einsetzen (verhindert, dass jemand Code in Beschreibungen schmuggelt)
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const formatDate = (ts) => new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
  return 'am ' + formatDate(ts);
}

/* ---------- 2. Verbindung zur Datenbank ---------- */
const isConfigured = typeof SUPABASE_URL === 'string' && !SUPABASE_URL.includes('DEIN-PROJEKT');
const db = isConfigured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Antwort von Supabase prüfen: Daten zurückgeben oder Fehler werfen
function must(result) {
  if (result.error) throw result.error;
  return result.data;
}

// Technische Fehlermeldungen in verständliches Deutsch übersetzen
function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Keine Verbindung zur Datenbank. Bist du online?';
  if (/anonymous sign-ins are disabled/i.test(msg)) return 'In Supabase ist „Anonymous Sign-Ins“ noch nicht eingeschaltet (siehe ANLEITUNG.md).';
  if (/could not find the function|does not exist|schema cache/i.test(msg)) return 'Die Datenbank ist noch nicht eingerichtet. Bitte supabase/schema.sql ausführen.';
  if (err?.code === '42501' || err?.code === 'PGRST116' || /row-level security|permission denied/i.test(msg)) return 'Dazu hast du keine Berechtigung.';
  return msg;
}

// Eine Aktion ausführen: Button sperren, Fehler als Hinweis zeigen
async function act(button, task) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (err) {
    console.error(err);
    toast(esc(friendlyError(err)), 'error');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

/* ---------- 3. Datenspeicher ----------
   Wir laden alle Daten einmal in den Speicher und zeichnen daraus die Seiten.
   Nach jeder Änderung (oder wenn ein Mitspieler etwas ändert) laden wir neu. */
const Store = {
  data: { users: [], offers: [], reviews: [], proposals: [] },

  async refresh() {
    const [players, offers, reviews, proposals] = await Promise.all([
      db.from('players').select('*'),
      db.from('offers').select('*').order('created', { ascending: false }),
      db.from('reviews').select('*').order('created', { ascending: false }),
      db.from('price_offers').select('*').order('created', { ascending: false }), // nur meine bzw. die an mich
    ]);
    const time = (value) => (value ? Date.parse(value) : null);
    this.data = {
      users: must(players).map((p) => ({ ...p, joined: time(p.joined) })),
      offers: must(offers).map((o) => ({ ...o, created: time(o.created), reservedAt: time(o.reserved_at), soldAt: time(o.sold_at) })),
      reviews: must(reviews).map((r) => ({ ...r, offerId: r.offer_id, created: time(r.created) })),
      proposals: must(proposals).map((p) => ({ ...p, offerId: p.offer_id, created: time(p.created) })),
    };
  },
};

const offerById = (id) => Store.data.offers.find((o) => o.id === id);
const userByName = (name) => Store.data.users.find((u) => u.name.toLowerCase() === String(name).toLowerCase());
const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const dealPrice = (o) => o.final_price ?? o.price;
const openProposalsFor = (offerId) => Store.data.proposals.filter((p) => p.offerId === offerId && p.status === 'offen');
const myOpenProposal = (offerId) => Store.data.proposals.find((p) => p.offerId === offerId && p.buyer === me() && p.status === 'offen');

function sellerStats(name) {
  const reviews = Store.data.reviews.filter((r) => r.seller === name);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;
  const sales = Store.data.offers.filter((o) => o.seller === name && o.status === 'verkauft').length;
  return { avg, count: reviews.length, sales };
}

const OFFER_STATUS = {
  verfuegbar: { label: 'Verfügbar', step: 0 },
  reserviert: { label: 'Reserviert', step: 1 },
  verkauft:   { label: 'Verkauft', step: 2 },
};
const PROPOSAL_STATUS = { offen: 'Offen', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt', zurueckgezogen: 'Zurückgezogen' };

/* ---------- 4. Sitzung: wer ist angemeldet? ---------- */
let currentUser = null;
const me = () => currentUser;

// Jeder Browser bekommt bei der ersten Anmeldung eine unsichtbare Supabase-Sitzung
async function ensureSession() {
  const { data } = await db.auth.getSession();
  if (data.session) return;
  must(await db.auth.signInAnonymously());
}

/* ---------- 5. Bausteine für die Oberfläche ---------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13.5V20h14v-6.5"/>',
  orders: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  // Kategorie-Symbole
  blocks: '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5V12"/><path d="M21 7v10l-9 5"/>',
  ores: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M12 21 8 9l4-6 4 6-4 12"/>',
  tools: '<path d="M14 10 4 20"/><path d="M7 5.5c4.5-3 10-2.5 13 1-3.5-.8-6.5 0-8.5 2"/><path d="M18.5 17c3-4.5 2.5-10-1-13 .8 3.5 0 6.5-2 8.5"/>',
  armor: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M12 3v18"/>',
  food: '<path d="M12 7c-2-2-7-2-8 3s2 11 5 11c1 0 2-.5 3-.5s2 .5 3 .5c3 0 6-6 5-11s-6-5-8-3z"/><path d="M12 7c0-2 1-4 3-4"/>',
  misc: '<path d="M9 3h6"/><path d="M10 3v5L5 17a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3"/><path d="M7 15h10"/>',
};

function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const diamond = () =>
  '<svg class="dia" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="url(#dia-grad)"/><path d="M2 9h20M12 3 8 9l4 12 4-12-4-6" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1"/></svg>';

function price(amount, large = false) {
  return `<span class="price ${large ? 'price-lg' : ''}" aria-label="${amount} Diamanten">${diamond()}<span>${amount}</span></span>`;
}

function stars(value) {
  const full = Math.round(value);
  return `<span class="stars" aria-label="${value.toFixed(1)} von 5 Sternen">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= full ? 'on' : '')).join('')}</span>`;
}

// Bild eines Items: Blöcke als Pixel-Würfel, alles andere als Symbol-Kachel
function itemArt(o) {
  if (TEXTURES[o.texture]) return cubeSVG(o.texture, o.id);
  const cat = catById(o.category);
  return `<div class="icon-art" style="--tint:${esc(o.tint || cat.color)}">${icon(cat.icon)}</div>`;
}

const thumb = (o) => `<div class="thumb" style="--tint:${catById(o.category).color}">${itemArt(o)}</div>`;
const statusPill = (status) => `<span class="status status-${status}">${OFFER_STATUS[status].label}</span>`;
const playerLink = (name) => `<a href="#/verkaeufer/${encodeURIComponent(name)}"><b>${esc(name)}</b></a>`;

function progress(status) {
  const step = OFFER_STATUS[status].step;
  return `<ol class="progress">${['Verfügbar', 'Reserviert', 'Verkauft']
    .map((label, i) => `<li class="${i <= step ? 'done' : ''}"><span class="pdot">${icon('check')}</span>${label}</li>`).join('')}</ol>`;
}

function emptyState(iconName, title, text, extra = '') {
  return `<div class="empty">${icon(iconName)}<h3>${title}</h3><p>${text}</p>${extra}</div>`;
}

function offerCard(o) {
  const cat = catById(o.category);
  const st = sellerStats(o.seller);
  const canBuy = o.status === 'verfuegbar' && o.seller !== me();
  const meta = {
    verfuegbar: `${o.amount} Stück`,
    reserviert: `Reserviert für <b>${esc(o.buyer || '–')}</b>`,
    verkauft: `Verkauft an <b>${esc(o.buyer || '–')}</b>`,
  }[o.status];
  return `
    <article class="card ${o.status === 'verkauft' ? 'is-soldout' : ''}" style="--tint:${cat.color}">
      <a class="card-link" href="#/angebot/${o.id}" aria-label="${esc(o.item)} ansehen"></a>
      <div class="card-media">
        ${itemArt(o)}
        <span class="tag">${cat.name}</span>
        ${o.status !== 'verfuegbar' ? `<span class="tag tag-status ${o.status}">${OFFER_STATUS[o.status].label}</span>` : ''}
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(o.item)}</h3>
        <p class="card-meta">${meta}</p>
        <div class="card-foot">
          ${price(dealPrice(o))}
          ${canBuy ? `<button class="btn btn-primary btn-buy" data-action="buy" data-id="${o.id}">Kaufen</button>` : ''}
        </div>
        <div class="card-seller">
          ${pixelHead(o.seller)}<span class="name">${esc(o.seller)}</span>
          ${st.count ? `<span class="rating-mini">${icon('star')}${st.avg.toFixed(1)}</span>` : ''}
        </div>
      </div>
    </article>`;
}

/* Was sieht wer zu einem Angebot – und welche Knöpfe gibt es?
   Wird auf der Angebotsseite und auf der Bestellseite benutzt. */
function dealInfo(o) {
  const mine = o.seller === me();
  const buying = !!o.buyer && o.buyer === me();
  const seller = playerLink(o.seller);
  const buyer = o.buyer ? playerLink(o.buyer) : '<b>–</b>';
  const fp = dealPrice(o);
  const btn = (action, label, cls = 'btn-ghost', ic = '') =>
    `<button class="btn ${cls} btn-sm" data-action="${action}" data-id="${o.id}">${ic ? icon(ic) : ''}${label}</button>`;

  if (o.status === 'reserviert') {
    if (mine) return {
      hint: `Reserviert für ${buyer}. Triff dich mit ihm/ihr im Spiel – du bekommst <b>${fp} Diamanten</b>. Danach markierst du das Angebot als verkauft.`,
      actions: btn('mark-sold', 'Als verkauft markieren', 'btn-primary', 'check') + btn('cancel-reservation', 'Reservierung aufheben'),
    };
    if (buying) return {
      hint: `Reserviert für dich! Triff dich mit ${seller} im Spiel und bezahle <b>${fp} Diamanten</b> bei der Übergabe.`,
      actions: btn('cancel-reservation', 'Reservierung stornieren'),
    };
    return { hint: `Gerade reserviert für ${buyer}. Wird die Reservierung aufgehoben, ist es wieder verfügbar.`, actions: '' };
  }

  if (o.status === 'verkauft') {
    if (buying) {
      const reviewed = Store.data.reviews.some((r) => r.offerId === o.id);
      return {
        hint: `Du hast das von ${seller} für <b>${fp} Diamanten</b> gekauft.`,
        actions: reviewed ? `<span class="muted small">${icon('check')} Bewertet</span>` : btn('review', 'Verkäufer bewerten', 'btn-ghost', 'star'),
      };
    }
    if (mine) return { hint: `Verkauft an ${buyer} für <b>${fp} Diamanten</b>.`, actions: btn('delete-offer', 'Aus der Liste löschen', 'btn-ghost', 'trash') };
    return { hint: `Verkauft an ${buyer}.`, actions: '' };
  }

  // verfügbar
  if (mine) {
    const n = openProposalsFor(o.id).length;
    return {
      hint: n ? `Du hast <b>${n} offene${n === 1 ? 'n' : ''} Preisvorschl${n === 1 ? 'ag' : 'äge'}</b>.` : 'Wartet auf einen Käufer.',
      actions: `<a class="btn btn-ghost btn-sm" href="#/verkaufen/${o.id}">${icon('edit')}Bearbeiten</a>` + btn('delete-offer', 'Löschen', 'btn-danger', 'trash'),
    };
  }
  const prop = myOpenProposal(o.id);
  return {
    hint: prop
      ? `Dein Preisvorschlag: <b>${prop.amount} Diamanten</b> – wartet auf Antwort von ${seller}.`
      : `Mit „Kaufen“ reservierst du das Angebot. Danach triffst du dich mit ${seller} im Spiel.`,
    actions: btn('buy', 'Kaufen', 'btn-primary', 'cart')
      + (prop ? `<button class="btn btn-ghost btn-sm" data-action="withdraw-proposal" data-id="${prop.id}">Vorschlag zurückziehen</button>`
              : o.price > 1 ? btn('buy', 'Preis vorschlagen', 'btn-ghost', 'tag') : ''),
  };
}

// Offene Preisvorschläge für ein eigenes Angebot – mit Annehmen/Ablehnen
function proposalList(o) {
  const props = openProposalsFor(o.id);
  if (!props.length) return '';
  return `
    <div class="proposals">
      <h4>Preisvorschläge <span class="muted">(Angebotspreis ${o.price} Diamanten)</span></h4>
      ${props.map((p) => `
        <div class="proposal">
          ${pixelHead(p.buyer)}
          <a class="name" href="#/verkaeufer/${encodeURIComponent(p.buyer)}">${esc(p.buyer)}</a>
          ${price(p.amount)}
          <div class="btns">
            <button class="btn btn-primary btn-sm" data-action="accept-proposal" data-id="${p.id}">Annehmen</button>
            <button class="btn btn-ghost btn-sm" data-action="decline-proposal" data-id="${p.id}">Ablehnen</button>
          </div>
        </div>`).join('')}
    </div>`;
}

/* ---------- 6. Seiten ---------- */
const filters = { q: '', cat: 'alle', sort: 'neu', max: '', available: true };

function renderHome() {
  const d = Store.data;
  const available = d.offers.filter((o) => o.status === 'verfuegbar');
  const traded = d.offers.filter((o) => o.status === 'verkauft').reduce((s, o) => s + dealPrice(o), 0);

  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow"><span class="dot"></span>Live auf unserem Server</span>
        <h1>Der Marktplatz für<br><span class="grad">deine Diamanten.</span></h1>
        <p class="lead">Finde Items deiner Mitspieler und reserviere sie mit einem Klick. Bezahlt wird mit Diamanten, übergeben wird direkt im Spiel.</p>
        <form class="search search-hero" data-search>
          ${icon('search')}
          <input name="q" type="search" placeholder="Wonach suchst du? z. B. Eisenerz" value="${esc(filters.q)}" autocomplete="off" aria-label="Suche">
          <button class="btn btn-primary">Suchen</button>
        </form>
        <div class="stats">
          <div><b>${available.length}</b><span>Angebote</span></div>
          <div><b>${d.users.length}</b><span>Händler</span></div>
          <div><b>${diamond()}${traded}</b><span>gehandelt</span></div>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="glow"></div>
        <div class="float f1">${cubeSVG('diamond_block', 'hero')}</div>
        <div class="float f2">${cubeSVG('grass', 'hero')}</div>
        <div class="float f3">${cubeSVG('gold_ore', 'hero')}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Kategorien</h2></div>
      <div class="cat-grid">
        ${CATEGORIES.map((c) => `
          <button class="cat-card" data-action="set-cat" data-cat="${c.id}" style="--tint:${c.color}">
            <span class="cat-icon">${icon(c.icon)}</span>
            <span class="cat-name">${c.name}</span>
            <span class="cat-count">${available.filter((o) => o.category === c.id).length} Angebote</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="section" id="markt">
      <div class="section-head">
        <h2>Alle Angebote</h2>
        <span class="muted" id="result-count"></span>
      </div>
      <div class="toolbar">
        <div class="chips" id="chips"></div>
        <div class="filters">
          <label class="field-inline">
            <span>Sortieren</span>
            <select id="f-sort">
              <option value="neu">Neueste</option>
              <option value="guenstig">Preis aufsteigend</option>
              <option value="teuer">Preis absteigend</option>
              <option value="bewertung">Beste Händler</option>
            </select>
          </label>
          <label class="field-inline">
            <span>Max.</span>${diamond()}
            <input id="f-max" type="number" min="1" placeholder="egal" value="${esc(filters.max)}">
          </label>
          <label class="switch">
            <input id="f-avail" type="checkbox" ${filters.available ? 'checked' : ''}>
            <span class="track"></span>Nur verfügbare
          </label>
        </div>
      </div>
      <div class="grid" id="grid"></div>
    </section>`;

  $('#f-sort').value = filters.sort;
  $('#f-sort').onchange = (e) => { filters.sort = e.target.value; updateGrid(); };
  $('#f-max').oninput = (e) => { filters.max = e.target.value; updateGrid(); };
  $('#f-avail').onchange = (e) => { filters.available = e.target.checked; updateGrid(); };
  updateGrid();
}

function filteredOffers() {
  const q = filters.q.trim().toLowerCase();
  const max = Number(filters.max);
  const order = { verfuegbar: 0, reserviert: 1, verkauft: 2 };
  const list = Store.data.offers.filter((o) =>
    (filters.cat === 'alle' || o.category === filters.cat) &&
    (!filters.available || o.status === 'verfuegbar') &&
    (!max || dealPrice(o) <= max) &&
    (!q || `${o.item} ${o.description} ${o.seller}`.toLowerCase().includes(q))
  );
  const sorters = {
    neu: (a, b) => b.created - a.created,
    guenstig: (a, b) => dealPrice(a) - dealPrice(b),
    teuer: (a, b) => dealPrice(b) - dealPrice(a),
    bewertung: (a, b) => sellerStats(b.seller).avg - sellerStats(a.seller).avg,
  };
  // Verfügbare zuerst, dann nach der gewählten Sortierung
  return list.sort((a, b) => order[a.status] - order[b.status] || sorters[filters.sort](a, b));
}

function updateGrid() {
  const list = filteredOffers();
  $('#chips').innerHTML = [{ id: 'alle', name: 'Alle' }, ...CATEGORIES]
    .map((c) => `<button class="chip ${filters.cat === c.id ? 'active' : ''}" data-action="set-cat" data-cat="${c.id}">${c.name}</button>`)
    .join('');
  $('#result-count').textContent = `${list.length} Treffer`;
  const noOffers = Store.data.offers.length === 0;
  $('#grid').innerHTML = list.length
    ? list.map(offerCard).join('')
    : noOffers
      ? emptyState('store', 'Noch keine Angebote', 'Sei der Erste und stell etwas ein!', '<a href="#/verkaufen" class="btn btn-primary btn-sm">Angebot einstellen</a>')
      : emptyState('search', 'Nichts gefunden', 'Probier einen anderen Suchbegriff oder entferne Filter.',
          '<button class="btn btn-ghost btn-sm" data-action="clear-filters">Filter zurücksetzen</button>');
}

function renderOffer(id) {
  const o = offerById(id);
  if (!o) return renderNotFound('Dieses Angebot gibt es nicht (mehr).');
  const cat = catById(o.category);
  const st = sellerStats(o.seller);
  const deal = dealInfo(o);
  const discounted = o.final_price != null && o.final_price !== o.price;
  const more = Store.data.offers.filter((x) => x.seller === o.seller && x.id !== o.id && x.status === 'verfuegbar').slice(0, 4);

  app.innerHTML = `
    <a href="#/" class="back">${icon('arrowLeft')}Zurück zum Markt</a>
    <div class="detail" style="--tint:${cat.color}">
      <div class="detail-media">${itemArt(o)}</div>
      <div class="detail-info">
        <div class="detail-tags"><span class="tag static">${cat.name}</span>${statusPill(o.status)}<span class="muted small">eingestellt ${timeAgo(o.created)}</span></div>
        <h1>${esc(o.item)}</h1>
        <p class="detail-amount">${o.amount} Stück</p>
        <div class="detail-price">${price(dealPrice(o), true)}${discounted ? `<span class="muted"><s>${o.price}</s> · Preisvorschlag angenommen</span>` : ''}</div>
        ${o.description ? `<p class="detail-desc">${esc(o.description)}</p>` : ''}
        <div class="deal-box ${o.status}" style="margin-top:24px">
          ${o.status !== 'verfuegbar' ? progress(o.status) : ''}
          ${deal.hint ? `<p class="hint">${deal.hint}</p>` : ''}
          <div class="deal-actions">${deal.actions}</div>
        </div>
        ${o.seller === me() && o.status === 'verfuegbar' ? proposalList(o) : ''}
        <a class="seller-card" href="#/verkaeufer/${encodeURIComponent(o.seller)}">
          ${pixelHead(o.seller)}
          <div>
            <span class="muted small">Verkäufer</span>
            <b>${esc(o.seller)}</b>
            <span class="small">${st.count ? `${stars(st.avg)} <span class="muted">${st.avg.toFixed(1)} · ${st.count} Bewertungen</span>` : '<span class="muted">Noch keine Bewertungen</span>'}</span>
          </div>
          <span class="chev">›</span>
        </a>
        <div class="howto">
          <h4>${icon('swap')}So läuft der Handel</h4>
          <ol>
            <li>„Kaufen“ klicken – das Angebot ist für dich reserviert</li>
            <li>Im Spiel treffen: Diamanten gegen Items</li>
            <li>Der Verkäufer markiert es als verkauft, du kannst bewerten</li>
          </ol>
        </div>
      </div>
    </div>
    ${more.length ? `
      <section class="section">
        <div class="section-head"><h2>Mehr von ${esc(o.seller)}</h2></div>
        <div class="grid">${more.map(offerCard).join('')}</div>
      </section>` : ''}`;
}

function renderSeller(name) {
  const u = userByName(name);
  if (!u) return renderNotFound('Diesen Spieler gibt es auf dem Marktplatz nicht.');
  const st = sellerStats(u.name);
  const isMe = u.name === me();
  const offers = Store.data.offers.filter((o) => o.seller === u.name && (isMe || o.status !== 'verkauft'));
  const reviews = Store.data.reviews.filter((r) => r.seller === u.name);
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.stars === n).length }));

  app.innerHTML = `
    <section class="profile">
      <div class="profile-banner"></div>
      <div class="profile-main">
        <div class="profile-head">${pixelHead(u.name)}</div>
        <div class="profile-info">
          <h1>${esc(u.name)} ${isMe ? '<span class="tag static">Du</span>' : ''}</h1>
          <p class="muted">${esc(u.bio || (isMe ? 'Erzähl den anderen etwas über dich.' : 'Noch keine Beschreibung.'))}
            ${isMe ? `<button class="linklike small" data-action="edit-bio">Bearbeiten</button>` : ''}</p>
          <p class="muted small">Händler seit ${formatDate(u.joined)}</p>
        </div>
        <div class="profile-stats">
          <div><b>${st.count ? st.avg.toFixed(1) : '–'}</b><span>Bewertung</span></div>
          <div><b>${st.sales}</b><span>Verkäufe</span></div>
          <div><b>${offers.filter((o) => o.status === 'verfuegbar').length}</b><span>Angebote</span></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>${isMe ? 'Deine Angebote' : `Angebote von ${esc(u.name)}`}</h2>
        ${isMe ? `<a href="#/verkaufen" class="btn btn-primary btn-sm">${icon('plus')}Neues Angebot</a>` : ''}
      </div>
      <div class="grid">
        ${offers.length ? offers.map(offerCard).join('') : emptyState('store', 'Keine Angebote', isMe ? 'Stell dein erstes Angebot ein!' : 'Gerade ist nichts im Angebot.')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Bewertungen</h2><span class="muted">${reviews.length}</span></div>
      <div class="reviews-layout">
        <div class="rating-summary">
          <div class="rating-big">${st.count ? st.avg.toFixed(1) : '–'}</div>
          ${stars(st.avg)}
          <p class="muted small">${st.count} Bewertung${st.count === 1 ? '' : 'en'}</p>
          ${dist.map((x) => `
            <div class="bar-row"><span>${x.n}</span><div class="bar"><i style="width:${reviews.length ? (x.count / reviews.length) * 100 : 0}%"></i></div><span>${x.count}</span></div>`).join('')}
        </div>
        <div class="review-list">
          ${reviews.length ? reviews.map(reviewItem).join('') : emptyState('star', 'Noch keine Bewertungen', 'Nach einem Kauf können Käufer hier bewerten.')}
        </div>
      </div>
    </section>`;
}

function reviewItem(r) {
  return `
    <article class="review">
      <div class="review-head">
        ${pixelHead(r.author)}
        <div><a href="#/verkaeufer/${encodeURIComponent(r.author)}">${esc(r.author)}</a>${stars(r.stars)}</div>
        <span class="muted small when">${timeAgo(r.created)}</span>
      </div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ''}
    </article>`;
}

// Bestellseite: "Meine Angebote" und "Meine Käufe"
function renderOrders(tab) {
  if (!me()) return renderLoginRequired('Melde dich an, um deine Angebote und Käufe zu sehen.');
  const buyingTab = tab === 'kaeufe';
  const statusOrder = { reserviert: 0, verfuegbar: 1, verkauft: 2 };
  const byStatus = (a, b) => statusOrder[a.status] - statusOrder[b.status]
    || openProposalsFor(b.id).length - openProposalsFor(a.id).length
    || b.created - a.created;

  const myOffers = Store.data.offers.filter((o) => o.seller === me()).sort(byStatus);
  const myBuys = Store.data.offers.filter((o) => o.buyer === me()).sort(byStatus);
  const myProposals = Store.data.proposals.filter((p) => p.buyer === me()).slice(0, 20);

  let content;
  if (!buyingTab) {
    content = myOffers.length
      ? myOffers.map((o) => dealCard(o, true)).join('')
      : emptyState('store', 'Noch keine Angebote', 'Stell dein erstes Angebot ein – deine Mitspieler sehen es sofort.',
          '<a href="#/verkaufen" class="btn btn-primary btn-sm">Angebot einstellen</a>');
  } else {
    content = (myBuys.length
      ? myBuys.map((o) => dealCard(o, false)).join('')
      : emptyState('cart', 'Noch keine Käufe', 'Stöbere im Markt und klicke bei einem Angebot auf „Kaufen“.', '<a href="#/" class="btn btn-primary btn-sm">Zum Markt</a>'))
      + (myProposals.length ? `
        <h2 class="subhead">Meine Preisvorschläge</h2>
        <div class="prop-list">${myProposals.map(proposalRow).join('')}</div>` : '');
  }

  app.innerHTML = `
    <div class="page-head">
      <h1>Bestellungen</h1>
      <p class="muted">Hier siehst du, was reserviert ist und mit wem du dich im Spiel treffen musst.</p>
    </div>
    <div class="tabs">
      <a href="#/bestellungen/angebote" class="tab ${buyingTab ? '' : 'active'}">Meine Angebote <span class="count">${myOffers.length}</span></a>
      <a href="#/bestellungen/kaeufe" class="tab ${buyingTab ? 'active' : ''}">Meine Käufe <span class="count">${myBuys.length}</span></a>
    </div>
    <div class="orders">${content}</div>`;
}

function dealCard(o, asSeller) {
  const deal = dealInfo(o);
  const other = asSeller ? o.buyer : o.seller;
  return `
    <article class="order">
      <header class="order-head">
        <a class="deal-title" href="#/angebot/${o.id}">
          ${thumb(o)}
          <div><b>${esc(o.item)}</b><span class="muted small">${o.amount} Stück · eingestellt ${timeAgo(o.created)}</span></div>
        </a>
        ${statusPill(o.status)}
      </header>
      ${other ? `
        <a class="order-party" href="#/verkaeufer/${encodeURIComponent(other)}">
          ${pixelHead(other)}
          <span><span class="muted small">${asSeller ? 'Käufer' : 'Verkäufer'}</span><b>${esc(other)}</b></span>
        </a>` : ''}
      ${o.status !== 'verfuegbar' ? progress(o.status) : ''}
      ${asSeller && o.status === 'verfuegbar' ? proposalList(o) : ''}
      <footer class="order-foot">
        <p class="hint">${deal.hint}</p>
        <div class="order-actions">${deal.actions}</div>
        <div class="order-total">${o.status === 'verfuegbar' ? 'Preis' : 'Vereinbart'} ${price(dealPrice(o))}</div>
      </footer>
    </article>`;
}

function proposalRow(p) {
  const o = offerById(p.offerId);
  if (!o) return '';
  return `
    <div class="prop-row">
      <a class="deal-title" href="#/angebot/${o.id}">
        ${thumb(o)}
        <div><b>${esc(o.item)}</b><span class="muted small">von ${esc(o.seller)} · Angebotspreis ${o.price} Diamanten · ${timeAgo(p.created)}</span></div>
      </a>
      ${price(p.amount)}
      <span class="status status-${p.status}">${PROPOSAL_STATUS[p.status]}</span>
      ${p.status === 'offen' ? `<button class="btn btn-ghost btn-sm" data-action="withdraw-proposal" data-id="${p.id}">Zurückziehen</button>` : ''}
    </div>`;
}

// Neues Angebot einstellen – oder ein eigenes bearbeiten (#/verkaufen/<id>)
function renderSell(editId) {
  if (!me()) return renderLoginRequired('Melde dich an, um ein Angebot einzustellen.');
  const editing = editId ? offerById(editId) : null;
  if (editId && (!editing || editing.seller !== me())) return renderNotFound('Dieses Angebot kannst du nicht bearbeiten.');
  if (editing && editing.status !== 'verfuegbar') return renderNotFound('Reservierte oder verkaufte Angebote können nicht mehr bearbeitet werden.');
  const v0 = editing || { item: '', category: 'bloecke', texture: '', amount: 64, price: 1, description: '' };

  app.innerHTML = `
    ${editing ? `<a href="#/angebot/${editing.id}" class="back">${icon('arrowLeft')}Zurück zum Angebot</a>` : ''}
    <div class="page-head">
      <h1>${editing ? 'Angebot bearbeiten' : 'Angebot einstellen'}</h1>
      <p class="muted">${editing ? 'Ändere Preis, Menge oder Beschreibung.' : 'Was möchtest du verkaufen? Bezahlung und Übergabe machst du später im Spiel.'}</p>
    </div>
    <div class="sell-layout">
      <form class="panel form" id="sell-form" novalidate>
        <label class="field"><span>Item</span><input name="item" maxlength="40" placeholder="z. B. Eichenstamm" value="${esc(v0.item)}" required></label>
        <div class="field-row">
          <label class="field"><span>Kategorie</span>
            <select name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === v0.category ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Aussehen</span>
            <select name="texture">
              <option value="">Symbol der Kategorie</option>
              ${Object.entries(TEXTURES).map(([key, t]) => `<option value="${key}" ${key === v0.texture ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="field-row">
          <label class="field"><span>Menge (Stück)</span><input name="amount" type="number" min="1" max="2304" value="${v0.amount}"></label>
          <label class="field"><span>Preis</span>
            <div class="input-dia">${diamond()}<input name="price" type="number" min="1" max="9999" value="${v0.price}"></div>
          </label>
        </div>
        <label class="field"><span>Beschreibung <em>(optional)</em></span>
          <textarea name="description" maxlength="200" rows="3" placeholder="z. B. Verzauberungen, Zustand, wann du online bist…">${esc(v0.description)}</textarea>
          <small id="desc-count">0 / 200</small>
        </label>
        <button class="btn btn-primary btn-lg btn-block" id="sell-submit">${editing ? 'Änderungen speichern' : 'Angebot veröffentlichen'}</button>
      </form>
      <aside class="sell-preview">
        <span class="muted small">Vorschau</span>
        <div id="preview"></div>
        <p class="muted small">So sehen andere Spieler dein Angebot auf dem Marktplatz.</p>
      </aside>
    </div>`;

  const form = $('#sell-form');
  const read = () => {
    const f = new FormData(form);
    return {
      item: String(f.get('item')).trim(),
      category: f.get('category'),
      texture: f.get('texture') || null,
      amount: Math.floor(Number(f.get('amount'))),
      price: Math.floor(Number(f.get('price'))),
      description: String(f.get('description')).trim(),
    };
  };
  const updatePreview = () => {
    const v = read();
    $('#preview').innerHTML = offerCard({
      ...v, id: editing ? editing.id : 'vorschau', tint: editing?.tint, seller: me(), status: 'verfuegbar', created: Date.now(),
      item: v.item || 'Dein Item', amount: v.amount || 1, price: v.price || 0,
    });
    $('#desc-count').textContent = `${v.description.length} / 200`;
  };

  form.addEventListener('input', (e) => {
    e.target.closest('.field')?.classList.remove('invalid');
    // Passende Kategorie vorschlagen, wenn ein Block-Look gewählt wird
    if (e.target.name === 'texture' && e.target.value) {
      form.elements.category.value = e.target.value.endsWith('_ore') ? 'erze' : 'bloecke';
    }
    updatePreview();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = read();
    const invalid = [];
    if (v.item.length < 2) invalid.push('item');
    if (!(v.amount >= 1 && v.amount <= 2304)) invalid.push('amount');
    if (!(v.price >= 1 && v.price <= 9999)) invalid.push('price');
    if (invalid.length) {
      // querySelector statt form.elements[name]: "form.elements.item" wäre eine eingebaute Funktion
      invalid.forEach((name) => form.querySelector(`[name="${name}"]`).closest('.field').classList.add('invalid'));
      toast('Bitte prüfe die markierten Felder.', 'error');
      return;
    }
    act($('#sell-submit'), async () => {
      const saved = editing
        ? must(await db.from('offers').update(v).eq('id', editing.id).select().single())
        : must(await db.from('offers').insert({ ...v, seller: me() }).select().single());
      await Store.refresh();
      toast(editing ? 'Änderungen gespeichert.' : `<b>${esc(saved.item)}</b> ist jetzt im Markt!`, 'success');
      location.hash = '#/angebot/' + saved.id;
    });
  });

  updatePreview();
}

function renderLoginRequired(text) {
  app.innerHTML = `
    <div class="center-page">
      ${emptyState('user', 'Bitte anmelden', text, '<button class="btn btn-primary" data-action="login">Mit Minecraft-Namen anmelden</button>')}
    </div>`;
}

function renderNotFound(text) {
  app.innerHTML = `
    <div class="center-page">
      ${emptyState('search', 'Nicht gefunden', text, '<a href="#/" class="btn btn-primary">Zum Markt</a>')}
    </div>`;
}

// Wird angezeigt, solange in js/config.js noch keine Supabase-Daten stehen
function renderSetup() {
  app.innerHTML = `
    <div class="center-page">
      <div class="empty">
        ${icon('database')}
        <h3>Fast geschafft: Datenbank verbinden</h3>
        <p>${!isConfigured ? 'Trage deine Supabase-Adresse und deinen Key in <code>js/config.js</code> ein.' : 'Die Supabase-Bibliothek konnte nicht geladen werden. Bist du online?'}</p>
        <ol class="setup-steps">
          <li>Kostenloses Projekt auf <b>supabase.com</b> anlegen</li>
          <li><code>supabase/schema.sql</code> im SQL Editor ausführen</li>
          <li>„Anonymous Sign-Ins“ einschalten</li>
          <li>URL und Key in <code>js/config.js</code> eintragen</li>
        </ol>
        <p class="small">Die ausführliche Anleitung steht in <code>ANLEITUNG.md</code>.</p>
      </div>
    </div>`;
}

function renderError(err) {
  app.innerHTML = `
    <div class="center-page">
      ${emptyState('database', 'Marktplatz konnte nicht geladen werden', esc(friendlyError(err)), '<button class="btn btn-primary" onclick="location.reload()">Neu laden</button>')}
    </div>`;
}

/* ---------- 7. Kopfzeile & Navigation ---------- */
let currentPage = '';
let scrollToMarket = false;

function updateChrome() {
  // Wo muss ich gerade etwas tun? Reservierte eigene Angebote + offene Preisvorschläge
  const todo = me()
    ? Store.data.offers.filter((o) => o.seller === me() && o.status === 'reserviert').length
      + Store.data.proposals.filter((p) => p.status === 'offen' && offerById(p.offerId)?.seller === me()).length
    : 0;
  $$('[data-orders-count]').forEach((b) => { b.textContent = todo; b.hidden = !todo; });

  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === currentPage));

  $('#user-slot').innerHTML = me()
    ? `<div class="user-menu">
        <button class="user-btn" data-action="toggle-menu" aria-label="Benutzermenü">${pixelHead(me())}<span class="hide-sm">${esc(me())}</span></button>
        <div class="menu" id="user-menu">
          <a href="#/verkaeufer/${encodeURIComponent(me())}">${icon('user')}Mein Profil</a>
          <a href="#/bestellungen">${icon('orders')}Bestellungen</a>
          <a href="#/verkaufen">${icon('plus')}Angebot einstellen</a>
          <button data-action="logout">${icon('logout')}Abmelden</button>
        </div>
      </div>`
    : `<button class="btn btn-primary btn-sm" data-action="login" ${db ? '' : 'disabled'}>Anmelden</button>`;
}

/* ---------- 8. Kaufen, Reservieren, Preisvorschläge ---------- */

// Eine Datenbank-Funktion aufrufen, danach neu laden und neu zeichnen
function runRpc(button, fn, args, message) {
  return act(button, async () => {
    must(await db.rpc(fn, args));
    await Store.refresh();
    closeModal();
    if (message) toast(message, 'success');
    render();
    updateChrome();
  });
}

function openBuy(id) {
  const o = offerById(id);
  if (!o) return;
  if (!me()) return openLogin(() => openBuy(id));
  if (o.seller === me()) return toast('Das ist dein eigenes Angebot.', 'error');
  if (o.status !== 'verfuegbar') return toast('Dieses Angebot ist leider schon weg.', 'error');
  const prop = myOpenProposal(o.id);

  openModal(`
    <div class="modal-head"><h2>Kaufen</h2><button class="icon-btn" data-action="close-modal" aria-label="Schließen">${icon('close')}</button></div>
    <div class="buy-summary">
      ${thumb(o)}
      <div><b>${esc(o.item)}</b><span class="muted small">${o.amount} Stück · von ${esc(o.seller)}</span></div>
      ${price(o.price)}
    </div>
    <p>Mit dem Klick ist das Angebot für dich <b>reserviert</b>. Danach triffst du dich mit <b>${esc(o.seller)}</b> im Spiel und bezahlst <b>${o.price} Diamanten</b>.</p>
    <button class="btn btn-primary btn-lg btn-block" data-action="reserve" data-id="${o.id}">Für ${o.price} Diamanten reservieren</button>
    ${o.price > 1 ? `
      <div class="divider">oder</div>
      <form class="proposal-form" id="proposal-form" novalidate>
        <label class="field"><span>Preis vorschlagen</span>
          <div class="input-dia">${diamond()}<input name="amount" type="number" min="1" max="${o.price - 1}" value="${prop ? prop.amount : ''}" placeholder="z. B. ${Math.max(1, Math.round(o.price * 0.8))}"></div>
        </label>
        <button class="btn btn-ghost">${prop ? 'Vorschlag ändern' : 'Vorschlag senden'}</button>
      </form>
      <small class="note">${o.seller} kann deinen Vorschlag annehmen oder ablehnen. Nimmt er/sie an, ist das Angebot für dich reserviert.</small>` : ''}`);

  const form = $('#proposal-form');
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const amount = Math.floor(Number(form.elements.amount.value));
    if (!(amount >= 1 && amount < o.price)) {
      form.querySelector('.field').classList.add('invalid');
      return toast(`Dein Vorschlag muss zwischen 1 und ${o.price - 1} Diamanten liegen.`, 'error');
    }
    runRpc(form.querySelector('button'), 'make_price_offer', { p_offer: o.id, p_amount: amount },
      `Vorschlag über ${amount} Diamanten an <b>${esc(o.seller)}</b> gesendet.`);
  };
}

function reserve(id, button) {
  const o = offerById(id);
  return act(button, async () => {
    must(await db.rpc('reserve_offer', { p_offer: id }));
    await Store.refresh();
    closeModal();
    toast(`Reserviert! Triff dich jetzt im Spiel mit <b>${esc(o.seller)}</b>.`, 'success');
    if (location.hash === '#/angebot/' + id) { render(); updateChrome(); } else location.hash = '#/angebot/' + id;
  });
}

function openReview(offerId) {
  const o = offerById(offerId);
  if (!o) return;
  openModal(`
    <div class="modal-head"><h2>${esc(o.seller)} bewerten</h2><button class="icon-btn" data-action="close-modal" aria-label="Schließen">${icon('close')}</button></div>
    <p>Wie lief der Handel um <b>${esc(o.item)}</b>? Deine Bewertung hilft anderen Spielern.</p>
    <form id="review-form" class="form">
      <div class="star-input" role="radiogroup" aria-label="Sterne">
        ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="stars" id="star-${n}" value="${n}" ${n === 5 ? 'checked' : ''}><label for="star-${n}" aria-label="${n} Sterne">${icon('star')}</label>`).join('')}
      </div>
      <label class="field"><span>Kommentar <em>(optional)</em></span><textarea name="text" rows="3" maxlength="200" placeholder="z. B. Schnelle Übergabe, alles wie beschrieben."></textarea></label>
      <button class="btn btn-primary btn-lg btn-block">Bewertung abschicken</button>
    </form>`);

  $('#review-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    runRpc(e.target.querySelector('button'), 'add_review',
      { p_offer: o.id, p_stars: Number(f.get('stars')), p_text: String(f.get('text')) }, 'Danke für deine Bewertung!');
  };
}

function openBioEditor() {
  const u = userByName(me());
  openModal(`
    <div class="modal-head"><h2>Über dich</h2><button class="icon-btn" data-action="close-modal" aria-label="Schließen">${icon('close')}</button></div>
    <form id="bio-form" class="form">
      <label class="field"><span>Kurze Beschreibung</span>
        <textarea name="bio" rows="3" maxlength="200" placeholder="z. B. Wo ist dein Laden? Wann bist du online?">${esc(u?.bio)}</textarea>
      </label>
      <button class="btn btn-primary btn-lg btn-block">Speichern</button>
    </form>`);
  $('#bio-form').onsubmit = (e) => {
    e.preventDefault();
    const bio = String(new FormData(e.target).get('bio')).trim();
    act(e.target.querySelector('button'), async () => {
      must(await db.from('players').update({ bio }).eq('name', me()).select().single());
      await Store.refresh();
      closeModal();
      render();
    });
  };
}

/* ---------- 9. Anmelden mit Minecraft-Name + PIN ---------- */
function openLogin(after) {
  openModal(`
    <div class="modal-head"><h2>Anmelden</h2><button class="icon-btn" data-action="close-modal" aria-label="Schließen">${icon('close')}</button></div>
    <p>Gib deinen Minecraft-Namen ein. Beim ersten Mal denkst du dir eine PIN aus – damit kann niemand anderes unter deinem Namen handeln.</p>
    <form id="login-form" class="form" novalidate>
      <div class="login-preview" id="login-head">${pixelHead('Penisbasar')}</div>
      <label class="field"><span>Minecraft-Name</span><input name="player" maxlength="16" placeholder="z. B. Steve_Baut" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <label class="field"><span>PIN <em>(4–8 Ziffern)</em></span>
        <input name="pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="current-password" required>
        <small id="pin-hint">Die PIN brauchst du nur auf neuen Geräten. Danach bleibst du angemeldet.</small>
      </label>
      <small class="error" id="login-err"></small>
      <button class="btn btn-primary btn-lg btn-block" id="login-btn">Anmelden</button>
    </form>`);

  const form = $('#login-form');
  const nameInput = form.elements.player;
  const pinInput = form.elements.pin;
  const hint = $('#pin-hint');
  const button = $('#login-btn');
  const nameOk = (n) => /^[A-Za-z0-9_]{3,16}$/.test(n);
  let statusTimer;

  // Beim Tippen nachsehen, ob der Name schon vergeben ist
  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    $('#login-head').innerHTML = pixelHead(name || 'Penisbasar');
    $('#login-err').textContent = '';
    clearTimeout(statusTimer);
    if (!nameOk(name)) return;
    statusTimer = setTimeout(async () => {
      const { data: status } = await db.rpc('player_status', { p_name: name });
      if (nameInput.value.trim() !== name || !status) return;
      const texts = {
        new: ['Dieser Name ist neu. Denk dir eine PIN aus und merk sie dir gut!', 'Registrieren', 'new-password'],
        unclaimed: ['Dieser Beispiel-Spieler hat noch keine PIN. Mit deiner PIN gehört er dir.', 'Übernehmen', 'new-password'],
        claimed: ['Willkommen zurück! Gib deine PIN ein.', 'Anmelden', 'current-password'],
      };
      [hint.textContent, button.textContent, pinInput.autocomplete] = texts[status];
    }, 300);
  });
  pinInput.addEventListener('input', () => { $('#login-err').textContent = ''; });

  form.onsubmit = (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    if (!nameOk(name)) { $('#login-err').textContent = 'Ein Minecraft-Name hat 3–16 Zeichen: Buchstaben, Zahlen und _'; return; }
    if (!/^[0-9]{4,8}$/.test(pin)) { $('#login-err').textContent = 'Die PIN besteht aus 4 bis 8 Ziffern.'; return; }

    act(button, async () => {
      await ensureSession();
      const result = must(await db.rpc('sign_in', { p_name: name, p_pin: pin }));
      if (!result.ok) {
        $('#login-err').textContent = result.error === 'locked'
          ? 'Zu viele falsche Versuche. Bitte warte 15 Minuten.'
          : 'Die PIN stimmt nicht.';
        pinInput.select();
        return;
      }
      currentUser = result.name;
      await Store.refresh();
      closeModal();
      toast(`Willkommen, <b>${esc(result.name)}</b>!`, 'success');
      render();
      updateChrome();
      if (after) after();
    });
  };
  setTimeout(() => nameInput.focus(), 50);
}

function logout() {
  return act(null, async () => {
    must(await db.rpc('sign_out_device'));
    currentUser = null;
    await Store.refresh();
    toast('Du bist abgemeldet.');
    if (location.hash === '#/' || location.hash === '') router(); else location.hash = '#/';
  });
}

/* ---------- 10. Dialoge & Hinweise ---------- */
function openModal(html) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${message}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3400);
  setTimeout(() => el.remove(), 3800);
}

/* ---------- 11. Seitenwechsel (Router) ----------
   Die Adresse hinter dem # bestimmt die Seite, z. B. #/angebot/<id> */
function render() {
  const [page = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  currentPage = page === 'verkaeufer' && me() && arg.toLowerCase() === me().toLowerCase() ? 'profil' : page;

  if (!db) { currentPage = ''; return renderSetup(); }
  if (page === 'angebot') renderOffer(arg);
  else if (page === 'verkaeufer') renderSeller(arg);
  else if (page === 'bestellungen') renderOrders(arg || 'angebote');
  else if (page === 'verkaufen') renderSell(arg);
  else { currentPage = ''; renderHome(); }
}

function router() {
  closeModal();
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
  updateChrome();
  if (scrollToMarket) {
    scrollToMarket = false;
    $('#markt')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function goToMarket() {
  if ($('#grid') && currentPage === '') {
    updateGrid();
    $('#markt').scrollIntoView({ behavior: 'smooth' });
  } else {
    scrollToMarket = true;
    if (location.hash === '#/') router(); else location.hash = '#/';
  }
}

/* ---------- 12. Live-Updates ----------
   Ändert ein Mitspieler etwas, laden wir die Daten neu und zeichnen die
   aktuelle Seite neu – aber nicht, während du gerade etwas eintippst. */
let syncTimer = null;

function refreshView() {
  updateChrome();
  if (currentPage === '' && $('#grid')) return updateGrid();
  const focused = document.activeElement;
  const typing = app.contains(focused) && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName);
  if (currentPage === 'verkaufen' || typing) return;
  render();
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await Store.refresh();
      refreshView();
    } catch (err) {
      console.warn('Aktualisieren fehlgeschlagen:', err);
    }
  }, 400);
}

function subscribeLive() {
  const channel = db.channel('marktplatz');
  ['players', 'offers', 'price_offers', 'reviews'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleSync);
  });
  channel.subscribe();
  // Falls Live-Updates mal nicht ankommen: beim Zurückkehren zum Tab neu laden
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
}

/* ---------- 13. Klicks & Eingaben zentral behandeln ---------- */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu')) $('#user-menu')?.classList.remove('open');
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;

  const actions = {
    'buy': () => openBuy(id),
    'reserve': () => reserve(id, el),
    'cancel-reservation': () => {
      const o = offerById(id);
      const question = o?.seller === me() ? 'Reservierung aufheben? Das Angebot ist danach wieder für alle verfügbar.' : 'Deine Reservierung wirklich stornieren?';
      if (confirm(question)) runRpc(el, 'cancel_reservation', { p_offer: id }, 'Reservierung aufgehoben.');
    },
    'mark-sold': () => {
      if (confirm('Hast du die Diamanten bekommen und die Items übergeben?')) runRpc(el, 'mark_sold', { p_offer: id }, 'Als verkauft markiert. 🎉');
    },
    'accept-proposal': () => {
      if (confirm('Vorschlag annehmen? Das Angebot wird dann für diesen Käufer reserviert.')) {
        runRpc(el, 'respond_price_offer', { p_id: Number(id), p_accept: true }, 'Vorschlag angenommen – das Angebot ist jetzt reserviert.');
      }
    },
    'decline-proposal': () => runRpc(el, 'respond_price_offer', { p_id: Number(id), p_accept: false }, 'Vorschlag abgelehnt.'),
    'withdraw-proposal': () => runRpc(el, 'withdraw_price_offer', { p_id: Number(id) }, 'Vorschlag zurückgezogen.'),
    'review': () => openReview(id),
    'login': () => openLogin(),
    'logout': logout,
    'profile': () => (me() ? (location.hash = '#/verkaeufer/' + encodeURIComponent(me())) : db && openLogin()),
    'toggle-menu': () => $('#user-menu').classList.toggle('open'),
    'set-cat': () => { filters.cat = el.dataset.cat; el.classList.contains('cat-card') ? goToMarket() : updateGrid(); },
    'clear-filters': () => { Object.assign(filters, { q: '', cat: 'alle', max: '', available: true }); $$('[data-search] input').forEach((i) => { i.value = ''; }); renderHome(); },
    'delete-offer': () => {
      if (!confirm('Angebot wirklich löschen?')) return;
      act(el, async () => {
        const deleted = must(await db.from('offers').delete().eq('id', id).select());
        if (!deleted.length) throw new Error('Dazu hast du keine Berechtigung.');
        await Store.refresh();
        toast('Angebot gelöscht.');
        if (currentPage === 'bestellungen') render(); else location.hash = '#/bestellungen/angebote';
      });
    },
    'edit-bio': openBioEditor,
    'close-modal': closeModal,
  };

  if (actions[el.dataset.action]) {
    e.preventDefault();
    actions[el.dataset.action]();
  }
});

// Suche: live beim Tippen, Enter springt zu den Ergebnissen
document.addEventListener('input', (e) => {
  if (!e.target.closest('[data-search]')) return;
  filters.q = e.target.value;
  $$('[data-search] input').forEach((i) => { if (i !== e.target) i.value = filters.q; });
  if ($('#grid') && currentPage === '') updateGrid();
});
document.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-search]')) return;
  e.preventDefault();
  e.target.querySelector('input').blur();
  goToMarket();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

window.addEventListener('hashchange', router);

/* ---------- 14. Start ---------- */
async function start() {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  updateChrome();
  if (!db) return router();

  app.innerHTML = '<div class="loading"><span class="spinner"></span>Marktplatz wird geladen…</div>';
  try {
    await db.auth.getSession();                  // gespeicherte Sitzung wiederherstellen
    currentUser = must(await db.rpc('my_name')); // zu welchem Spieler gehört dieses Gerät?
    await Store.refresh();
  } catch (err) {
    console.error(err);
    return renderError(err);
  }
  router();
  subscribeLive();
}

start();
