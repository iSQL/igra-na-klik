/*
 * Kviz linkovi — the /k pages (served as static files from
 * packages/server/assets/kviz-link, see index.ts). One small app that routes
 * on the path:
 *
 *   /k                    my links (kept in this browser's localStorage)
 *   /k/novi               new link, step 1: name, link, validity, PIN, brand
 *   /k/<naziv>/uredi      editor behind the PIN: questions, brand, dates, stats
 *     ?korak=pitanja      …the wizard's steps 2–3 (same screen, step bar on top)
 *     ?korak=gotovo       …step 4: link, QR, PIN
 *
 * Everything goes through /api/k. A correct PIN returns an edit token that is
 * remembered next to the link in localStorage; the PIN itself only stays in
 * sessionStorage long enough to show it on the "Gotovo" screen.
 */
(function () {
  'use strict';

  // ---- Utilities ------------------------------------------------------------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const fold = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/đ/g, 'dj')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDay = (ms) => {
    const d = new Date(ms);
    return d.getDate() + '. ' + MONTHS[d.getMonth()];
  };
  function fmtRange(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) {
      return da.getDate() + '.–' + db.getDate() + '. ' + MONTHS[db.getMonth()];
    }
    return fmtDay(a) + ' – ' + fmtDay(b);
  }
  const fmtDateTime = (ms) => {
    const d = new Date(ms);
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const toLocalInput = (ms) => {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const fromLocalInput = (v) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
  };

  const linkUrl = (slug) => location.origin + '/k/' + slug;
  const linkShort = (slug) => location.host + '/k/' + slug;

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[čć]/g, 'c')
      .replace(/š/g, 's')
      .replace(/ž/g, 'z')
      .replace(/đ/g, 'dj')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
  }

  // ---- Remembered links (this browser) ----------------------------------------

  const LS_KEY = 'igra-kviz-links';
  function myLinks() {
    try {
      const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string') : [];
    } catch (e) {
      return [];
    }
  }
  function saveMyLinks(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {
      /* private mode — the list just isn't remembered */
    }
  }
  function rememberLink(slug, token, name) {
    const old = myLinks();
    const prev = old.find((l) => l.slug === slug);
    const list = old.filter((l) => l.slug !== slug);
    list.unshift({ slug, token, name: name || (prev && prev.name) || slug });
    saveMyLinks(list);
  }
  function forgetLink(slug) {
    saveMyLinks(myLinks().filter((l) => l.slug !== slug));
  }
  function tokenOf(slug) {
    const l = myLinks().find((x) => x.slug === slug);
    return (l && l.token) || '';
  }

  // ---- Network ------------------------------------------------------------------

  async function api(method, url, body, token) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['X-Kviz-Token'] = token;
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* empty body */
    }
    if (!res.ok) {
      const err = new Error(data.error || 'Greška ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* fall through */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function shareLink(slug, title) {
    const url = linkUrl(slug);
    if (navigator.share) {
      try {
        await navigator.share({ url, title });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (await copyText(url)) toast('Link je kopiran.');
  }

  /** Downscale a picture to a JPEG data URL (keeps uploads small). */
  function resizeImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      if (!file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Izaberi sliku.'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Slika ne može da se učita.'));
      };
      img.src = url;
    });
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Fajl ne može da se pročita.'));
      r.readAsDataURL(file);
    });
  }

  // ---- Domain constants (mirror @igra/shared kviz-link.ts) ------------------------

  const ICONS = ['🍺', '🎂', '📚', '⚽', '🎬', '🐸', '🎵', '🧠', '🏆', '🎉', '🍕', '🌍'];
  const COLORS = ['#5a7a4e', '#1D3557', '#B85C4F', '#C29B47', '#6d9bd1'];
  const TIME_LIMITS = [10, 20, 30];
  const PLAYER_LIMITS = [4, 6, 8, 10, 12, 15];
  const MAX_ITEMS = 200;
  const MAX_OWN = 100;

  const TYPES = [
    { id: 'obicno', label: 'Obično (2–4 opcije)', chip: 'Obično' },
    { id: 'uljez', label: 'Uljez (4 pojma)', chip: 'Uljez' },
    { id: 'broj', label: 'Broj (klizač)', chip: 'Broj' },
    { id: 'emoji', label: 'Emoji zagonetka', chip: 'Emoji' },
    { id: 'dopuna', label: 'Završi citat', chip: 'Citat' },
    { id: 'anagram', label: 'Anagram', chip: 'Anagram' },
    { id: 'redosled', label: 'Redosled', chip: 'Redosled' },
    { id: 'domino', label: 'Domino (pre/posle)', chip: 'Domino' },
    { id: 'matrica', label: 'Matrica (3×3)', chip: 'Matrica' },
    { id: 'audio', label: 'Audio + opcije', chip: 'Audio' },
    { id: 'video', label: 'YouTube + opcije', chip: 'YouTube' },
    { id: 'piksel', label: 'Piksel (slika + odgovor)', chip: 'Piksel' },
    { id: 'geo', label: 'Geo (mapa)', chip: 'Geo' },
  ];
  const TYPE = {};
  TYPES.forEach((t) => (TYPE[t.id] = t));
  const SHORT = {
    obicno: 'obično', audio: 'audio', video: 'YouTube', geo: 'geo', broj: 'broj', emoji: 'emoji',
    uljez: 'uljez', dopuna: 'citat', piksel: 'piksel', anagram: 'anagram', redosled: 'redosled',
    domino: 'domino', matrica: 'matrica',
  };
  const DEFAULT_TEXT = {
    emoji: 'Šta se krije iza emojija?', dopuna: 'Završi citat!', anagram: 'Reši anagram!',
    piksel: 'Šta je na slici?', uljez: 'Pronađi uljeza!', domino: 'Pre ili posle?',
    matrica: 'Poveži 3 pojma koja idu zajedno!',
  };
  const STATUS = {
    active: ['Aktivan', 'pill-active'],
    scheduled: ['Zakazan', 'pill-scheduled'],
    expired: ['Istekao', 'pill-expired'],
  };

  function statusOf(l) {
    const now = Date.now();
    if (now < l.validFrom) return 'scheduled';
    if (now > l.expiresAt) return 'expired';
    return 'active';
  }

  function metaLine(l) {
    const n = l.items.length;
    const parts = [n + ' pitanja'];
    parts.push(l.order === 'random' ? 'nasumično ' + Math.min(l.drawCount, n || l.drawCount) : 'fiksan redosled');
    const st = statusOf(l);
    if (st === 'scheduled') parts.push('od ' + fmtDay(l.validFrom));
    else if (st === 'expired') parts.push('isteklo ' + fmtDay(l.expiresAt));
    else parts.push(fmtRange(l.validFrom, l.expiresAt));
    return parts.join(' · ');
  }

  const app = $('#app');

  // ---- Shared bits: phone preview, brand fields, PIN boxes --------------------------

  function phonePreview(b) {
    const cover = b.coverData || b.coverUrl;
    return (
      '<div class="phone"><div class="phone-card">' +
      (cover
        ? '<div class="phone-cover" style="background-image:url(\'' + esc(cover) + '\')"></div>'
        : '<div class="phone-cover blank" style="background-color:' + esc(b.color) + '">naslovna slika</div>') +
      '<div class="phone-body"><span class="phone-kicker">Kviz</span>' +
      '<span class="phone-title">' + esc(b.emoji) + ' ' + esc(b.name || 'Naziv kviza') + '</span>' +
      (b.message ? '<span class="phone-msg">' + esc(b.message) + '</span>' : '') +
      '</div></div><div class="phone-input">Tvoje ime</div><div class="phone-btn">Uđi u kviz</div></div>'
    );
  }

  /** Cover / icon / colour / message. `b` is mutated; onChange re-renders the preview. */
  function brandHtml(b) {
    return (
      '<div class="row2">' +
      '<div><label class="lbl">Naslovna slika (opciono)</label>' +
      '<div class="drop" id="cover-drop" tabindex="0" role="button" aria-label="Naslovna slika">' +
      ((b.coverData || b.coverUrl)
        ? '<img alt="" src="' + esc(b.coverData || b.coverUrl) + '"><button type="button" class="iconbtn x" id="cover-x" title="Ukloni">✕</button>'
        : 'Prevuci sliku · 16:9<br>ili klikni') +
      '</div><input type="file" id="cover-file" accept="image/*" hidden></div>' +
      '<div><label class="lbl">Ikonica</label><div class="icons" id="icons">' +
      ICONS.map((e) => '<button type="button" data-e="' + e + '" class="' + (e === b.emoji ? 'on' : '') + '">' + e + '</button>').join('') +
      '</div><label class="lbl">Boja kartice</label><div class="swatches" id="swatches">' +
      COLORS.map((c) => '<button type="button" aria-label="Boja ' + c + '" data-c="' + c + '" class="' + (c === b.color ? 'on' : '') + '" style="background:' + c + '"></button>').join('') +
      '</div></div></div>' +
      '<label class="lbl">Poruka za igrače (opciono)</label>' +
      '<input class="field" id="b-msg" maxlength="120" placeholder="npr. Pobednik časti prvu turu 🍺" value="' + esc(b.message || '') + '">'
    );
  }

  function bindBrand(root, b, onChange) {
    const rerender = () => {
      const holder = $('#brand-fields', root);
      holder.innerHTML = brandHtml(b);
      bindBrand(root, b, onChange);
      onChange();
    };
    const drop = $('#cover-drop', root);
    const file = $('#cover-file', root);
    const take = async (f) => {
      if (!f) return;
      try {
        b.coverData = await resizeImage(f, 1280);
        rerender();
      } catch (e) {
        toast(e.message, true);
      }
    };
    drop.onclick = (e) => {
      if (e.target && e.target.id === 'cover-x') return;
      file.click();
    };
    drop.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') file.click();
    };
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add('over');
    };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      take(e.dataTransfer.files && e.dataTransfer.files[0]);
    };
    file.onchange = () => take(file.files && file.files[0]);
    const x = $('#cover-x', root);
    if (x)
      x.onclick = (e) => {
        e.stopPropagation();
        b.coverData = null;
        b.coverUrl = null;
        b.coverRemoved = true;
        rerender();
      };
    $$('#icons button', root).forEach((btn) => {
      btn.onclick = () => {
        b.emoji = btn.dataset.e;
        rerender();
      };
    });
    $$('#swatches button', root).forEach((btn) => {
      btn.onclick = () => {
        b.color = btn.dataset.c;
        rerender();
      };
    });
    $('#b-msg', root).oninput = (e) => {
      b.message = e.target.value;
      onChange();
    };
  }

  function pinHtml(digits, idPrefix) {
    return (
      '<div class="pin" id="' + idPrefix + '">' +
      [0, 1, 2, 3]
        .map((i) => '<input inputmode="numeric" maxlength="1" aria-label="PIN cifra ' + (i + 1) + '" value="' + esc(digits[i] || '') + '">')
        .join('') +
      '</div>'
    );
  }

  /** Wire four one-digit boxes; returns a getter for the 4-digit string. */
  function bindPin(box, onComplete) {
    const inputs = $$('input', box);
    inputs.forEach((inp, i) => {
      inp.oninput = () => {
        const v = inp.value.replace(/\D/g, '');
        if (v.length > 1) {
          // Pasted the whole PIN into one box.
          v.slice(0, 4 - i).split('').forEach((d, k) => (inputs[i + k].value = d));
        } else {
          inp.value = v;
        }
        const next = inputs.find((x, k) => k > i && !x.value);
        if (inp.value && next) next.focus();
        else if (inp.value && i < 3) inputs[i + 1].focus();
        if (onComplete && inputs.every((x) => x.value)) onComplete();
      };
      inp.onkeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
      };
      inp.onfocus = () => inp.select();
    });
    return () => inputs.map((x) => x.value).join('');
  }

  // ---- 1a: my links -------------------------------------------------------------------

  function renderList() {
    document.title = 'Kviz linkovi · Igra na klik';
    const list = myLinks();
    app.innerHTML =
      '<div class="wrap">' +
      '<div class="top"><div style="flex:1"><div class="logo">Igra <b>na klik</b> · Kviz linkovi</div>' +
      '<p class="lead">Napravi kviz sa svojim pitanjima i pošalji link. Ko otvori link, ulazi pravo u lobi.</p></div>' +
      '<a class="btn btn-gold" href="/k/novi">＋ Novi kviz link</a></div>' +
      '<div class="card"><h2>🔗 Linkovi (' + list.length + ')</h2>' +
      '<div class="links" id="links">' +
      (list.length ? '' : '<div class="empty">Još nemaš kviz linkova u ovom pregledaču.</div>') +
      '</div>' +
      '<p class="hint" style="margin-top:.8rem">Lista je sačuvana u ovom pregledaču. Na drugom uređaju otvori link, pa „Uredi kviz" i unesi PIN.</p>' +
      '<form id="open-form" class="searchrow" style="margin-top:.7rem">' +
      '<div class="slugbox" style="flex:1"><span class="pre mono">' + esc(location.host) + '/k/</span>' +
      '<input class="mono" id="open-slug" placeholder="naziv-kviza" aria-label="Naziv postojećeg kviza"></div>' +
      '<button class="btn btn-ghost">Uredi postojeći</button></form>' +
      '</div></div>';

    $('#open-form').onsubmit = (e) => {
      e.preventDefault();
      const slug = slugify($('#open-slug').value);
      if (slug) location.href = '/k/' + slug + '/uredi';
    };

    const host = $('#links');
    list.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML =
        '<span class="tile" style="background:var(--surface2)">⏳</span><div><div class="link-name">' + esc(entry.name) + '</div>' +
        '<div class="link-url mono">' + esc(linkShort(entry.slug)) + '</div></div>';
      host.appendChild(row);
      api('GET', '/api/k/' + entry.slug + '/manage', undefined, entry.token)
        .then((d) => {
          const l = d.link;
          rememberLink(entry.slug, entry.token, l.name);
          const st = STATUS[d.status];
          row.innerHTML =
            '<span class="tile" style="background:' + esc(l.color) + '33">' + esc(l.emoji) + '</span>' +
            '<div style="min-width:0;display:flex;flex-direction:column;gap:2px">' +
            '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap"><span class="link-name">' + esc(l.name) + '</span>' +
            '<span class="pill ' + st[1] + '">' + st[0] + '</span></div>' +
            '<span class="link-url mono">' + esc(linkShort(l.slug)) + '</span>' +
            '<span class="link-meta">' + esc(metaLine(l)) + '</span></div>' +
            '<div class="link-count"><b>' + d.stats.players + '</b><span>igrača</span></div>' +
            '<div class="link-acts">' +
            '<button class="btn btn-ghost btn-sm" data-a="copy">Kopiraj</button>' +
            '<a class="btn btn-ghost btn-sm" href="/k/' + l.slug + '/uredi#statistika">Statistika</a>' +
            '<a class="btn btn-primary btn-sm" href="/k/' + l.slug + '/uredi">Uredi</a></div>';
          $('[data-a=copy]', row).onclick = async () => {
            if (await copyText(linkUrl(l.slug))) toast('Link je kopiran.');
          };
        })
        .catch((err) => {
          const gone = err.status === 404;
          row.innerHTML =
            '<span class="tile" style="background:var(--surface2)">' + (gone ? '🗑' : '🔒') + '</span>' +
            '<div style="min-width:0;display:flex;flex-direction:column;gap:2px">' +
            '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap"><span class="link-name">' + esc(entry.name) + '</span>' +
            '<span class="pill ' + (gone ? 'pill-expired' : 'pill-locked') + '">' + (gone ? 'Obrisan' : 'Treba PIN') + '</span></div>' +
            '<span class="link-url mono">' + esc(linkShort(entry.slug)) + '</span></div><span></span>' +
            '<div class="link-acts">' +
            (gone ? '' : '<a class="btn btn-primary btn-sm" href="/k/' + entry.slug + '/uredi">Otključaj</a>') +
            '<button class="btn btn-ghost btn-sm" data-a="forget">Ukloni sa liste</button></div>';
          $('[data-a=forget]', row).onclick = () => {
            forgetLink(entry.slug);
            renderList();
          };
        });
    });
  }

  // ---- 1b: wizard step 1 ------------------------------------------------------------------

  function stepsHtml(current) {
    return (
      '<div class="steps">' +
      ['Osnovno', 'Pitanja', 'Pravila', 'Gotovo']
        .map((label, i) => {
          const n = i + 1;
          const on = Array.isArray(current) ? current.indexOf(n) >= 0 : n === current;
          const first = Array.isArray(current) ? current[0] : current;
          const done = n < first;
          return '<div class="step' + (on ? ' on' : done ? ' done' : '') + '"><span class="dot">' + (done ? '✓' : n) + '</span><span>' + label + '</span></div>';
        })
        .join('') +
      '</div>'
    );
  }

  function renderBasics() {
    document.title = 'Novi kviz link · Igra na klik';
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const start = now.getTime() + 3600_000;
    const st = {
      name: '',
      slug: '',
      slugTouched: false,
      slugOk: false,
      validFrom: start,
      expiresAt: start + 7 * 24 * 3600_000 - 60_000,
      pin: String(Math.floor(1000 + Math.random() * 9000)).split(''),
      emoji: ICONS[0],
      color: COLORS[0],
      message: '',
      coverData: null,
    };

    app.innerHTML =
      '<div class="shell">' +
      '<div class="shell-pad"><div class="shell-title">Novi kviz link</div><a class="back" href="/k">← Moji linkovi</a></div>' +
      stepsHtml(1) +
      '<div class="basics"><div style="display:flex;flex-direction:column;gap:1.1rem">' +
      '<div class="card"><h2>📝 Kviz</h2>' +
      '<label class="lbl" for="name">Naziv kviza *</label><input class="field" id="name" maxlength="60" placeholder="npr. Pab kviz · Oktobar">' +
      '<label class="lbl" for="slug">Link</label><div class="slugbox"><span class="pre mono">' + esc(location.host) + '/k/</span>' +
      '<input class="mono" id="slug" maxlength="40" placeholder="pab-kviz-oktobar"><span class="state" id="slug-state"></span></div>' +
      '<div class="row2" style="margin-top:.8rem"><div><label class="lbl" for="from" style="margin-top:0">Važi od</label><input class="field" type="datetime-local" id="from" value="' + toLocalInput(st.validFrom) + '"></div>' +
      '<div><label class="lbl" for="to" style="margin-top:0">Ističe</label><input class="field" type="datetime-local" id="to" value="' + toLocalInput(st.expiresAt) + '"></div></div>' +
      '<p class="hint">Posle isteka link prikazuje rezultate, ali nove partije ne mogu da počnu.</p>' +
      '<label class="lbl">PIN za uređivanje</label><div class="pin-row">' + pinHtml(st.pin, 'pin') +
      '<p class="hint">Ko ima link i PIN može da menja pitanja i vidi statistiku. Igračima PIN ne treba.</p></div></div>' +
      '<div class="card"><h2>🎨 Brending</h2><div id="brand-fields">' + brandHtml(st) + '</div></div>' +
      '<p class="err" id="err" hidden></p>' +
      '</div>' +
      '<div class="preview-col"><span>Pregled na telefonu</span><div id="preview">' + phonePreview(st) + '</div></div>' +
      '</div>' +
      '<div class="footbar"><a class="btn btn-ghost" href="/k">Otkaži</a><button class="btn btn-primary" id="next">Dalje: pitanja →</button></div>' +
      '</div>';

    const preview = () => ($('#preview').innerHTML = phonePreview(st));
    bindBrand(app, st, preview);
    const getPin = bindPin($('#pin'));

    let checkTimer = null;
    let checkSeq = 0;
    const checkSlug = () => {
      const state = $('#slug-state');
      const slug = st.slug;
      st.slugOk = false;
      if (!slug) {
        state.textContent = '';
        return;
      }
      state.className = 'state';
      state.textContent = '…';
      clearTimeout(checkTimer);
      const seq = ++checkSeq;
      checkTimer = setTimeout(async () => {
        try {
          const r = await api('GET', '/api/k/check?slug=' + encodeURIComponent(slug));
          if (seq !== checkSeq) return;
          st.slugOk = r.available;
          state.className = 'state ' + (r.available ? 'ok' : 'bad');
          state.textContent = r.available ? '✓ slobodno' : '✕ ' + (r.reason === 'Zauzeto' ? 'zauzeto' : 'neispravno');
          state.title = r.reason || '';
        } catch (e) {
          state.textContent = '';
        }
      }, 300);
    };

    $('#name').oninput = (e) => {
      st.name = e.target.value;
      if (!st.slugTouched) {
        st.slug = slugify(st.name);
        $('#slug').value = st.slug;
        checkSlug();
      }
      preview();
    };
    $('#slug').oninput = (e) => {
      st.slugTouched = true;
      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (clean !== e.target.value) e.target.value = clean;
      st.slug = clean;
      checkSlug();
    };
    $('#slug').onblur = (e) => {
      st.slug = slugify(e.target.value);
      e.target.value = st.slug;
      checkSlug();
    };

    const showErr = (msg) => {
      const el = $('#err');
      el.textContent = msg;
      el.hidden = !msg;
      if (msg) toast(msg, true);
    };

    $('#next').onclick = async () => {
      st.validFrom = fromLocalInput($('#from').value);
      st.expiresAt = fromLocalInput($('#to').value);
      const pin = getPin();
      if (!st.name.trim()) return showErr('Unesi naziv kviza.');
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(st.slug)) return showErr('Link: 3–40 slova, cifara ili crtica.');
      if (!st.slugOk) return showErr('Taj link nije slobodan — izaberi drugi naziv.');
      if (!Number.isFinite(st.validFrom) || !Number.isFinite(st.expiresAt)) return showErr('Unesi oba datuma.');
      if (st.expiresAt <= st.validFrom) return showErr('Datum isteka mora biti posle početka.');
      if (!/^\d{4}$/.test(pin)) return showErr('PIN mora imati 4 cifre.');
      showErr('');
      const btn = $('#next');
      btn.disabled = true;
      btn.textContent = 'Pravim link…';
      try {
        const r = await api('POST', '/api/k', {
          slug: st.slug,
          pin,
          name: st.name.trim(),
          emoji: st.emoji,
          color: st.color,
          message: st.message.trim(),
          validFrom: st.validFrom,
          expiresAt: st.expiresAt,
          coverData: st.coverData || undefined,
          items: [],
          own: [],
          order: 'fixed',
          drawCount: 10,
          timeLimit: 20,
          speedBonus: true,
          maxPlayers: 8,
        });
        rememberLink(r.slug, r.token, st.name.trim());
        try {
          sessionStorage.setItem('kviz-pin-' + r.slug, pin);
        } catch (e) {
          /* not shown on "Gotovo" then */
        }
        location.href = '/k/' + r.slug + '/uredi?korak=pitanja';
      } catch (e) {
        showErr(e.message);
        btn.disabled = false;
        btn.textContent = 'Dalje: pitanja →';
        if (e.status === 409) checkSlug();
      }
    };
  }

  // ---- PIN gate ------------------------------------------------------------------------------

  async function renderLock(slug, message) {
    document.title = 'Uredi kviz · Igra na klik';
    let name = slug;
    let exists = true;
    try {
      const d = await api('GET', '/api/k/' + slug);
      name = d.link.emoji + ' ' + d.link.name;
    } catch (e) {
      exists = e.status !== 404;
    }
    if (!exists) {
      forgetLink(slug);
      app.innerHTML =
        '<div class="wrap"><div class="card lock"><h2>🤷 Ovaj kviz link ne postoji</h2>' +
        '<p class="hint">Proveri naziv — možda je obrisan ili je istekao davno.</p>' +
        '<p style="margin-top:1rem"><a class="btn btn-primary" href="/k">Moji linkovi</a></p></div></div>';
      return;
    }
    app.innerHTML =
      '<div class="wrap"><div class="card lock"><h2>🔒 Uredi kviz</h2>' +
      '<div class="big" style="font-size:1.3rem">' + esc(name) + '</div>' +
      '<div class="link-url mono" style="margin-bottom:.6rem">' + esc(linkShort(slug)) + '</div>' +
      '<label class="lbl">PIN za uređivanje</label>' + pinHtml([], 'lock-pin') +
      '<p class="err" id="lock-err"' + (message ? '' : ' hidden') + '>' + esc(message || '') + '</p>' +
      '<div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap"><button class="btn btn-primary" id="unlock">Otključaj</button>' +
      '<a class="btn btn-ghost" href="/k">Moji linkovi</a></div></div></div>';
    const unlock = async () => {
      const pin = getPin();
      if (!/^\d{4}$/.test(pin)) return;
      try {
        const r = await api('POST', '/api/k/' + slug + '/unlock', { pin });
        rememberLink(slug, r.token, name.replace(/^\S+\s/, ''));
        openEditor(slug);
      } catch (e) {
        const el = $('#lock-err');
        el.textContent = e.message;
        el.hidden = false;
        $$('#lock-pin input').forEach((i) => (i.value = ''));
        $('#lock-pin input').focus();
      }
    };
    const getPin = bindPin($('#lock-pin'), unlock);
    $('#unlock').onclick = unlock;
    $('#lock-pin input').focus();
  }

  // ---- Editor ----------------------------------------------------------------------------------

  const ed = {
    slug: '',
    token: '',
    link: null,
    pub: null,
    status: 'active',
    stats: null,
    draft: null,
    dirty: false,
    wizard: false,
    tab: 'pitanja',
    bank: null,
    bankByKey: new Map(),
    ui: { source: 'bank', packs: new Set(), types: new Set(), q: '' },
  };

  window.addEventListener('beforeunload', (e) => {
    if (ed.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  function draftOf(l) {
    return {
      name: l.name,
      emoji: l.emoji,
      color: l.color,
      message: l.message || '',
      cover: l.cover || null,
      coverUrl: l.cover ? '/k-files/' + l.slug + '/' + l.cover : null,
      coverData: null,
      coverRemoved: false,
      validFrom: l.validFrom,
      expiresAt: l.expiresAt,
      items: l.items.slice(),
      own: JSON.parse(JSON.stringify(l.own)),
      order: l.order,
      drawCount: l.drawCount,
      timeLimit: l.timeLimit,
      speedBonus: l.speedBonus,
      maxPlayers: l.maxPlayers,
    };
  }

  function markDirty() {
    ed.dirty = true;
    $$('.dirty').forEach((el) => (el.hidden = false));
  }

  async function openEditor(slug) {
    ed.slug = slug;
    ed.token = tokenOf(slug);
    if (!ed.token) return renderLock(slug);
    app.innerHTML = '<div class="loading">Učitavam kviz…</div>';
    let d;
    try {
      d = await api('GET', '/api/k/' + slug + '/manage', undefined, ed.token);
    } catch (e) {
      if (e.status === 401) {
        rememberLink(slug, '', '');
        return renderLock(slug, 'PIN je u međuvremenu promenjen — unesi novi.');
      }
      return renderLock(slug);
    }
    applyManage(d);
    const korak = new URLSearchParams(location.search).get('korak');
    if (korak === 'gotovo') return renderDone();
    ed.wizard = korak === 'pitanja';
    const hash = location.hash.replace('#', '');
    ed.tab = ['pitanja', 'brending', 'rok', 'statistika'].indexOf(hash) >= 0 ? hash : 'pitanja';
    if (ed.wizard) ed.tab = 'pitanja';
    renderEditorShell();
  }

  function applyManage(d) {
    ed.link = d.link;
    ed.pub = d.public;
    ed.status = d.status;
    if (d.stats) ed.stats = d.stats;
    ed.draft = draftOf(d.link);
    ed.dirty = false;
    rememberLink(ed.slug, ed.token, d.link.name);
  }

  function headMeta() {
    const l = ed.link;
    if (ed.tab === 'statistika' && ed.stats) {
      return ed.stats.games + ' ' + plural(ed.stats.games, 'partija', 'partije', 'partija') + ' · ' + ed.stats.players + ' igrača';
    }
    if (ed.status === 'scheduled') return 'Počinje ' + fmtDay(l.validFrom);
    if (ed.status === 'expired') return 'Istekao ' + fmtDay(l.expiresAt);
    return 'Važi do ' + fmtDay(l.expiresAt);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderEditorShell() {
    const l = ed.link;
    document.title = l.name + ' · Kviz link';
    const tabs = [
      ['pitanja', 'Pitanja'],
      ['brending', 'Brending'],
      ['rok', 'Rok i PIN'],
      ['statistika', 'Statistika'],
    ];
    app.innerHTML =
      '<div class="ed-head"><img src="/play/ink-mark-reverse.svg" width="34" height="34" alt="">' +
      '<div class="t"><b>' + esc(l.emoji) + ' ' + esc(l.name) + '</b><span class="mono">' + esc(linkShort(l.slug)) + '</span></div>' +
      '<span class="badge">🔓 Otključano PIN-om</span><span class="meta" id="head-meta">' + esc(headMeta()) + '</span>' +
      '<a href="/k">Moji linkovi</a></div>' +
      (ed.wizard
        ? '<div style="background:#fff;border-bottom:1.5px solid var(--line);padding-bottom:1rem">' + stepsHtml([2, 3]) + '</div>'
        : '<div class="tabs" role="tablist">' +
          tabs.map((t) => '<button role="tab" data-tab="' + t[0] + '" class="' + (t[0] === ed.tab ? 'on' : '') + '">' + t[1] + '</button>').join('') +
          '</div>') +
      '<div id="tabbody"></div>';
    $$('.tabs button').forEach((b) => {
      b.onclick = () => {
        if (ed.dirty && !confirm('Imaš nesačuvane izmene. Odbaciti ih?')) return;
        if (ed.dirty) ed.draft = draftOf(ed.link);
        ed.dirty = false;
        ed.tab = b.dataset.tab;
        history.replaceState(null, '', '#' + ed.tab);
        renderEditorShell();
      };
    });
    const body = $('#tabbody');
    if (ed.tab === 'pitanja') renderQuestionsTab(body);
    else if (ed.tab === 'brending') renderBrandTab(body);
    else if (ed.tab === 'rok') renderTermsTab(body);
    else renderStatsTab(body);
  }

  /** PUT the draft (or a part of it). Returns true on success. */
  async function save(fields, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Čuvam…';
    }
    try {
      const body = {};
      fields.forEach((f) => (body[f] = ed.draft[f]));
      if (fields.indexOf('cover') >= 0) {
        delete body.cover;
        if (ed.draft.coverData) body.coverData = ed.draft.coverData;
        else if (ed.draft.coverRemoved) body.cover = null;
      }
      const d = await api('PUT', '/api/k/' + ed.slug, body, ed.token);
      const removed = ed.draft.items.length - d.link.items.length;
      applyManage(d);
      toast(removed > 0 ? 'Sačuvano. ' + removed + ' pitanja više ne postoji u bazi.' : 'Sačuvano.');
      return true;
    } catch (e) {
      toast(e.message, true);
      if (e.status === 401) renderLock(ed.slug, 'PIN je promenjen — unesi ga ponovo.');
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  // ---- 1c: questions -------------------------------------------------------------------------

  async function loadBank() {
    if (ed.bank) return ed.bank;
    const b = await api('GET', '/api/k/bank');
    ed.bank = b;
    ed.bankByKey = new Map(b.questions.map((q) => [q.key, q]));
    ed.packName = new Map(b.packs.map((p) => [p.id, p.name]));
    return b;
  }

  function ownBrief(q) {
    const t = q.type || 'obicno';
    if (t === 'broj') return '✔ ' + q.answer + (q.unit ? ' ' + q.unit : '');
    if (t === 'emoji') return q.emojis + ' → ✔ ' + q.answer;
    if (t === 'dopuna') return '„' + q.quote + ' …" → ✔ ' + q.answer;
    if (t === 'anagram' || t === 'piksel') return '✔ ' + q.answer;
    if (t === 'redosled') return (q.items || []).join(' · ');
    if (t === 'domino') return (q.items || []).map((x) => x.label + ' (' + x.value + ')').join(' · ');
    if (t === 'matrica') return (q.cells || []).map((x, i) => ((q.correct || []).indexOf(i) >= 0 ? '🔗 ' : '') + x).join(' · ');
    return (q.options || []).map((o, i) => (i === q.correctIndex ? (t === 'uljez' ? '🕵️ ' : '✔ ') : '') + o).join(' · ');
  }

  function ownPreview(o) {
    const q = o.question;
    const t = q.type || 'obicno';
    return { key: 'own:' + o.id, type: t, text: q.text || DEFAULT_TEXT[t] || '(bez teksta)', hint: ownBrief(q), own: true };
  }

  function previewOf(key) {
    if (key.indexOf('own:') === 0) {
      const o = ed.draft.own.find((x) => x.id === key.slice(4));
      return o ? ownPreview(o) : null;
    }
    return ed.bankByKey.get(key) || null;
  }

  function renderQuestionsTab(body) {
    body.innerHTML = '<div class="loading">Učitavam bazu pitanja…</div>';
    loadBank()
      .then(() => drawQuestions(body))
      .catch((e) => (body.innerHTML = '<div class="loading">' + esc(e.message) + '</div>'));
  }

  function filteredBank() {
    const ui = ed.ui;
    const q = fold(ui.q.trim());
    return ed.bank.questions.filter(
      (x) =>
        (ui.packs.size === 0 || ui.packs.has(x.packId)) &&
        (ui.types.size === 0 || ui.types.has(x.type)) &&
        (!q || fold(x.text + ' ' + x.hint).indexOf(q) >= 0)
    );
  }

  function drawQuestions(body) {
    const d = ed.draft;
    const ui = ed.ui;
    const inQuiz = new Set(d.items);
    const typesPresent = new Set(ed.bank.questions.map((q) => q.type));
    d.own.forEach((o) => typesPresent.add(o.question.type || 'obicno'));

    // Left: source, packs, types.
    const left =
      '<div class="qside">' +
      '<div style="display:flex;flex-direction:column;gap:.35rem"><span class="sec-lbl">Izvor</span><div class="src">' +
      '<button data-src="bank" class="' + (ui.source === 'bank' ? 'on' : '') + '">Baza pitanja <span>' + ed.bank.questions.length + '</span></button>' +
      '<button data-src="own" class="' + (ui.source === 'own' ? 'on' : '') + '">🔒 Samo ovaj kviz <span>' + d.own.length + '</span></button>' +
      '</div></div>' +
      (ui.source === 'bank'
        ? '<div style="display:flex;flex-direction:column;gap:.35rem"><span class="sec-lbl">Paketi</span><div class="checks">' +
          ed.bank.packs
            .map((p) => {
              const on = ui.packs.has(p.id);
              return '<label><span class="box' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</span><input type="checkbox" hidden data-pack="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><b>' + esc(p.name) + '</b><span>' + p.count + '</span></label>';
            })
            .join('') +
          '</div></div>' +
          '<div style="display:flex;flex-direction:column;gap:.45rem"><span class="sec-lbl">Vrste pitanja</span><div class="chips">' +
          TYPES.filter((t) => typesPresent.has(t.id))
            .map((t) => '<button class="chip' + (ui.types.has(t.id) ? ' on' : '') + '" data-type="' + t.id + '">' + t.chip + '</button>')
            .join('') +
          '</div></div>'
        : '<p class="hint">Pitanja koja si sam napisao. Ne ulaze u zajedničku bazu i vide ih samo igrači ovog kviza.</p>') +
      '</div>';

    // Middle: search + list.
    let rows = '';
    let banner = '';
    if (ui.source === 'bank') {
      const list = filteredBank();
      const filtered = ui.packs.size > 0 || ui.types.size > 0 || ui.q.trim();
      if (filtered && list.length) {
        const allIn = list.every((q) => inQuiz.has(q.key));
        const label =
          ui.packs.size === 1 && ui.types.size === 0 && !ui.q.trim()
            ? 'Paket „' + esc(ed.packName.get([...ui.packs][0])) + '" · ' + list.length + ' pitanja u filteru'
            : list.length + ' pitanja u filteru';
        banner =
          '<div class="banner"><span>' + label + '</span><button class="btn btn-ghost btn-sm" id="add-all">' +
          (allIn ? 'Ukloni sve iz kviza' : ui.packs.size === 1 ? 'Dodaj ceo paket' : 'Dodaj sve') +
          '</button></div>';
      }
      const LIMIT = 300;
      rows =
        list
          .slice(0, LIMIT)
          .map((q) => qRow(q, inQuiz.has(q.key), ed.packName.get(q.packId)))
          .join('') +
        (list.length > LIMIT ? '<div class="more">Još ' + (list.length - LIMIT) + ' — suzi pretragu.</div>' : '') +
        (list.length === 0 ? '<div class="empty">Nema pitanja za ovaj filter.</div>' : '');
    } else {
      const q = fold(ui.q.trim());
      const list = d.own.map(ownPreview).filter((x) => !q || fold(x.text + ' ' + x.hint).indexOf(q) >= 0);
      rows = list.length
        ? list.map((x) => qRow(x, inQuiz.has(x.key), '', true)).join('')
        : '<div class="empty">Još nema sopstvenih pitanja — „＋ Novo pitanje".</div>';
    }
    const mid =
      '<div class="qmid">' +
      '<div class="searchrow"><input class="field" id="search" placeholder="Pretraži pitanja…" value="' + esc(ui.q) + '">' +
      '<button class="btn btn-gold" id="new-q">＋ Novo pitanje</button></div>' +
      banner +
      '<div class="qrows" id="qrows">' + rows + '</div></div>';

    // Right: selection + rules.
    const n = d.items.length;
    const right =
      '<div class="qright">' +
      '<div class="qright-head"><b>U kvizu</b><span>' + n + ' pitanja</span></div>' +
      '<div class="seg"><button data-order="fixed" class="' + (d.order === 'fixed' ? 'on' : '') + '">Fiksan redosled</button>' +
      '<button data-order="random" class="' + (d.order === 'random' ? 'on' : '') + '">Nasumično</button></div>' +
      (d.order === 'random'
        ? '<div class="draw">Izvuci <input type="number" id="draw" min="1" max="' + Math.max(1, n) + '" value="' + Math.min(d.drawCount, Math.max(1, n)) + '"> od ' + n + ' za svaku partiju</div>'
        : '') +
      '<div class="sel" id="sel">' +
      (n
        ? d.items
            .map((key, i) => {
              const p = previewOf(key);
              return (
                '<div class="sel-row" data-key="' + esc(key) + '"><span class="grip" title="Prevuci">⋮⋮</span><span class="sel-num">' + (i + 1) + '.</span>' +
                '<span class="sel-text">' + (p && p.own ? '🔒 ' : '') + esc(p ? p.text : '(pitanje više ne postoji)') + '</span>' +
                '<span class="sel-type">' + esc(p ? SHORT[p.type] : '?') + '</span>' +
                '<button class="sel-x" data-rm="' + esc(key) + '" title="Izbaci iz kviza">✕</button></div>'
              );
            })
            .join('')
        : '<div class="empty">Klikni pitanja levo da ih dodaš.</div>') +
      '</div>' +
      '<div class="rules"><span class="sec-lbl">Pravila igre</span>' +
      '<div class="rule">Vreme po pitanju <span class="timers">' +
      TIME_LIMITS.map((s) => '<button data-time="' + s + '" class="' + (d.timeLimit === s ? 'on' : '') + '">' + s + ' s</button>').join('') +
      '<button data-time="" class="' + (d.timeLimit == null ? 'on' : '') + '">po pitanju</button></span></div>' +
      '<div class="rule">Brzina donosi bodove <button class="toggle' + (d.speedBonus ? ' on' : '') + '" id="speed" role="switch" aria-checked="' + d.speedBonus + '" aria-label="Brzina donosi bodove"></button></div>' +
      '<div class="rule">Igrači do <select id="maxp">' +
      PLAYER_LIMITS.map((v) => '<option value="' + v + '"' + (v === d.maxPlayers ? ' selected' : '') + '>' + v + '</option>').join('') +
      '</select></div></div>' +
      '<p class="dirty"' + (ed.dirty ? '' : ' hidden') + '>● Nesačuvane izmene</p>' +
      '<button class="btn btn-gold btn-wide save" id="save" style="min-height:48px">' + (ed.wizard ? 'Sačuvaj i završi →' : 'Sačuvaj kviz') + '</button>' +
      '</div>';

    body.innerHTML = '<div class="qgrid">' + left + mid + right + '</div>';

    const redraw = () => drawQuestions(body);
    const toggle = (key) => {
      const i = d.items.indexOf(key);
      if (i >= 0) d.items.splice(i, 1);
      else if (d.items.length >= MAX_ITEMS) return toast('Kviz može imati najviše ' + MAX_ITEMS + ' pitanja.', true);
      else d.items.push(key);
      markDirty();
      redraw();
    };

    $$('.src button', body).forEach((b) => (b.onclick = () => ((ui.source = b.dataset.src), redraw())));
    $$('[data-pack]', body).forEach((c) => {
      c.onchange = () => {
        if (c.checked) ui.packs.add(c.dataset.pack);
        else ui.packs.delete(c.dataset.pack);
        redraw();
      };
    });
    $$('[data-type]', body).forEach((b) => {
      b.onclick = () => {
        if (ui.types.has(b.dataset.type)) ui.types.delete(b.dataset.type);
        else ui.types.add(b.dataset.type);
        redraw();
      };
    });
    const search = $('#search', body);
    search.oninput = () => {
      ui.q = search.value;
      const pos = search.selectionStart;
      redraw();
      const s2 = $('#search', body);
      s2.focus();
      s2.setSelectionRange(pos, pos);
    };
    $('#new-q', body).onclick = () => openQuestionModal(null, redraw);
    const addAll = $('#add-all', body);
    if (addAll)
      addAll.onclick = () => {
        const list = filteredBank();
        const allIn = list.every((q) => d.items.indexOf(q.key) >= 0);
        if (allIn) {
          const drop = new Set(list.map((q) => q.key));
          d.items = d.items.filter((k) => !drop.has(k));
        } else {
          for (const q of list) {
            if (d.items.length >= MAX_ITEMS) {
              toast('Dostignut je maksimum od ' + MAX_ITEMS + ' pitanja.', true);
              break;
            }
            if (d.items.indexOf(q.key) < 0) d.items.push(q.key);
          }
        }
        markDirty();
        redraw();
      };
    $$('.qrow', body).forEach((r) => {
      r.onclick = (e) => {
        const act = e.target.closest('[data-edit],[data-del]');
        if (act) {
          e.stopPropagation();
          const id = act.dataset.edit || act.dataset.del;
          if (act.dataset.edit) return openQuestionModal(id, redraw);
          if (!confirm('Obrisati ovo pitanje iz kviza?')) return;
          d.own = d.own.filter((o) => o.id !== id);
          d.items = d.items.filter((k) => k !== 'own:' + id);
          markDirty();
          return redraw();
        }
        toggle(r.dataset.key);
      };
      r.onkeydown = (e) => {
        if (e.target === r && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          toggle(r.dataset.key);
        }
      };
    });
    $$('[data-rm]', body).forEach((b) => (b.onclick = () => toggle(b.dataset.rm)));
    $$('[data-order]', body).forEach((b) => {
      b.onclick = () => {
        d.order = b.dataset.order;
        if (d.order === 'random' && d.items.length) d.drawCount = Math.min(d.drawCount || 10, d.items.length);
        markDirty();
        redraw();
      };
    });
    const draw = $('#draw', body);
    if (draw)
      draw.onchange = () => {
        const v = parseInt(draw.value, 10);
        d.drawCount = Math.max(1, Math.min(d.items.length || 1, Number.isFinite(v) ? v : 10));
        draw.value = d.drawCount;
        markDirty();
      };
    $$('[data-time]', body).forEach((b) => {
      b.onclick = () => {
        d.timeLimit = b.dataset.time ? parseInt(b.dataset.time, 10) : null;
        markDirty();
        redraw();
      };
    });
    $('#speed', body).onclick = () => {
      d.speedBonus = !d.speedBonus;
      markDirty();
      redraw();
    };
    $('#maxp', body).onchange = (e) => {
      d.maxPlayers = parseInt(e.target.value, 10);
      markDirty();
    };
    bindReorder($('#sel', body), redraw);
    $('#save', body).onclick = async (e) => {
      if (ed.wizard && d.items.length === 0) return toast('Dodaj bar jedno pitanje.', true);
      const ok = await save(['items', 'own', 'order', 'drawCount', 'timeLimit', 'speedBonus', 'maxPlayers'], e.currentTarget);
      if (!ok) return;
      if (ed.wizard) location.href = '/k/' + ed.slug + '/uredi?korak=gotovo';
      else redraw();
    };
  }

  function qRow(q, on, packName, own) {
    return (
      '<div class="qrow' + (on ? ' on' : '') + '" role="button" tabindex="0" data-key="' + esc(q.key) + '">' +
      '<span class="box' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</span>' +
      '<span class="qtype">' + esc((TYPE[q.type] || { chip: q.type }).chip) + '</span>' +
      '<div class="qmain"><div class="qtext">' + esc(q.text) + '</div><div class="qhint">' +
      (q.media === 'slika' ? '🖼 ' : q.media === 'audio' ? '🎵 ' : q.media === 'video' ? '▶ ' : '') + esc(q.hint) + '</div></div>' +
      (own
        ? '<button class="iconbtn" data-edit="' + esc(q.key.slice(4)) + '" title="Izmeni">✎</button><button class="iconbtn" data-del="' + esc(q.key.slice(4)) + '" title="Obriši">🗑</button>'
        : '<span class="qpack">' + esc(packName || '') + '</span>') +
      '</div>'
    );
  }

  /** Drag by the grip — pointer events, so it works with a finger too. */
  function bindReorder(list, done) {
    let dragging = null;
    $$('.grip', list).forEach((grip) => {
      grip.style.touchAction = 'none';
      grip.onpointerdown = (e) => {
        e.preventDefault();
        dragging = grip.closest('.sel-row');
        dragging.classList.add('dragging');
        grip.setPointerCapture(e.pointerId);
      };
      grip.onpointermove = (e) => {
        if (!dragging) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const over = el && el.closest('.sel-row');
        if (!over || over === dragging || over.parentNode !== list) return;
        const r = over.getBoundingClientRect();
        list.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
      };
      grip.onpointerup = grip.onpointercancel = () => {
        if (!dragging) return;
        dragging.classList.remove('dragging');
        dragging = null;
        const order = $$('.sel-row', list).map((r) => r.dataset.key);
        if (order.join('|') !== ed.draft.items.join('|')) {
          ed.draft.items = order;
          markDirty();
        }
        done();
      };
    });
  }

  // ---- 1d: private question modal ------------------------------------------------------------

  function openQuestionModal(editId, onDone) {
    const d = ed.draft;
    const existing = editId ? d.own.find((o) => o.id === editId) : null;
    if (!existing && d.own.length >= MAX_OWN) return toast('Najviše ' + MAX_OWN + ' sopstvenih pitanja po kvizu.', true);
    const pend = { imgData: null, imgFile: null, audData: null, audFile: null, audName: '' };
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Pitanje">' +
      '<div class="modal-head"><b>' + (existing ? '✎ Izmena pitanja' : '➕ Novo pitanje') + '</b><button class="iconbtn" id="m-x" aria-label="Zatvori">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="note"><span>🔒</span><span>Pitanje se čuva samo u ovom kvizu. Ne ulazi u zajedničku bazu i vide ga samo igrači koji dođu preko <b class="mono">/k/' + esc(ed.slug) + '</b>.</span></div>' +
      '<label class="lbl">Tip pitanja</label><select class="field" id="q-type">' +
      TYPES.filter((t) => t.id !== 'geo').map((t) => '<option value="' + t.id + '">' + t.label + '</option>').join('') +
      '</select>' +
      '<div class="grp on"><label class="lbl" id="lbl-text">Tekst pitanja</label><textarea class="field" id="q-text" rows="2" placeholder="npr. Kako se zove konobar koji radi petkom?"></textarea></div>' +
      '<div class="grp" id="grp-choice"><label class="lbl" id="lbl-choice">Odgovori · označi tačan</label>' +
      [0, 1, 2, 3]
        .map((i) => '<div class="opt-row"><input type="radio" name="correct" value="' + i + '"' + (i === 0 ? ' checked' : '') + ' aria-label="Tačan odgovor ' + (i + 1) + '"><input class="field" id="q-opt' + i + '" placeholder="Odgovor ' + (i + 1) + (i >= 2 ? ' (opciono)' : '') + '"></div>')
        .join('') +
      '</div>' +
      '<div class="grp" id="grp-broj"><div class="row2">' +
      '<div><label class="lbl">Tačan odgovor</label><input class="field" type="number" id="q-b-ans" step="any"></div>' +
      '<div><label class="lbl">Jedinica (opciono)</label><input class="field" id="q-b-unit" maxlength="20" placeholder="din, kg, god."></div>' +
      '<div><label class="lbl">Min (klizač)</label><input class="field" type="number" id="q-b-min" step="any"></div>' +
      '<div><label class="lbl">Max (klizač)</label><input class="field" type="number" id="q-b-max" step="any"></div></div></div>' +
      '<div class="grp" id="grp-emoji"><label class="lbl">Emoji zagonetka</label><input class="field" id="q-e-emojis" maxlength="40" placeholder="🦁👑" style="font-size:1.2rem">' +
      '<label class="lbl">Rešenje</label><input class="field" id="q-e-ans" maxlength="60" placeholder="Kralj lavova">' +
      '<label class="lbl">Prihvaćeni odgovori (zarezom, opciono)</label><input class="field" id="q-e-accept" placeholder="The Lion King">' +
      '<label class="lbl">Kategorija (opciono — vide je igrači)</label><input class="field" id="q-e-cat" maxlength="40" placeholder="npr. Film"></div>' +
      '<div class="grp" id="grp-dopuna"><label class="lbl">Vidljivi deo citata (bez skrivene reči)</label><textarea class="field" id="q-d-quote" rows="2" placeholder="Bolje vrabac u ruci nego golub na"></textarea></div>' +
      '<div class="grp" id="grp-textans"><label class="lbl">Rešenje</label><input class="field" id="q-ta-ans" maxlength="60" placeholder="grani">' +
      '<label class="lbl">Prihvaćeni odgovori (zarezom, opciono)</label><input class="field" id="q-ta-accept"></div>' +
      '<div class="grp" id="grp-redosled"><label class="lbl">Pojmovi u TAČNOM redosledu (jedan po redu, 3–10)</label><textarea class="field" id="q-items" rows="5"></textarea></div>' +
      '<div class="grp" id="grp-domino"><label class="lbl">Stavke — „Naziv | vrednost" (3–12, jedna po redu)</label><textarea class="field" id="q-dom" rows="5" placeholder="Titanik potonuo | 1912"></textarea>' +
      '<div class="row3"><div><label class="lbl">Dugme „niže"</label><input class="field" id="q-dom-lo" maxlength="24" placeholder="Pre"></div>' +
      '<div><label class="lbl">Dugme „više"</label><input class="field" id="q-dom-hi" maxlength="24" placeholder="Posle"></div>' +
      '<div><label class="lbl">Jedinica</label><input class="field" id="q-dom-unit" maxlength="20" placeholder="god."></div></div></div>' +
      '<div class="grp" id="grp-matrica"><label class="lbl">9 polja mreže 3×3 (jedno po redu)</label><textarea class="field" id="q-mx" rows="9"></textarea>' +
      '<label class="lbl">Tačna 3 polja (brojevi 1–9, npr. 1,4,7)</label><input class="field" id="q-mx-ok" placeholder="1,4,7">' +
      '<label class="lbl">Objašnjenje veze (opciono)</label><input class="field" id="q-mx-ex" maxlength="200"></div>' +
      '<div class="grp" id="grp-video"><label class="lbl">YouTube link ili ID</label><input class="field" id="q-v-id" placeholder="https://youtu.be/…">' +
      '<div class="row2"><div><label class="lbl">Start (s)</label><input class="field" type="number" id="q-v-start" min="0"></div>' +
      '<div><label class="lbl">Kraj (s)</label><input class="field" type="number" id="q-v-end" min="1"></div></div></div>' +
      '<div class="grp" id="grp-audio"><label class="lbl">Audio fajl (mp3/ogg/m4a, do 5 MB)</label><input type="file" id="q-aud" accept="audio/*"><div class="hint" id="q-aud-name"></div></div>' +
      '<div class="grp" id="grp-image"><label class="lbl" id="lbl-image">Slika (opciono)</label>' +
      '<div class="drop" id="q-img-drop" style="height:64px" tabindex="0" role="button">Prevuci sliku ili klikni</div><input type="file" id="q-img" accept="image/*" hidden>' +
      '<div id="q-img-prev"></div></div>' +
      '<p class="hint">Ostali tipovi (broj, emoji, audio, YouTube, redosled…) imaju ista polja kao u Kviz generatoru.</p>' +
      '<p class="err" id="m-err" hidden></p>' +
      '<div class="modal-acts"><button class="btn btn-primary" id="m-add">' + (existing ? 'Sačuvaj izmenu' : 'Dodaj u kviz') + '</button>' +
      (existing ? '' : '<button class="btn btn-ghost" id="m-more">Dodaj i napravi još jedno</button>') +
      '</div></div></div>';
    document.body.appendChild(bg);
    const m = (id) => $('#' + id, bg);

    const close = () => bg.remove();
    m('m-x').onclick = close;
    bg.onclick = (e) => {
      if (e.target === bg) close();
    };
    const escKey = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escKey);
      }
    };
    document.addEventListener('keydown', escKey);

    const show = (id, on) => (m(id).className = 'grp' + (on ? ' on' : ''));
    const applyType = (t) => {
      const choice = t === 'obicno' || t === 'uljez' || t === 'audio' || t === 'video';
      show('grp-choice', choice);
      show('grp-broj', t === 'broj');
      show('grp-emoji', t === 'emoji');
      show('grp-dopuna', t === 'dopuna');
      show('grp-textans', t === 'dopuna' || t === 'anagram' || t === 'piksel');
      show('grp-redosled', t === 'redosled');
      show('grp-domino', t === 'domino');
      show('grp-matrica', t === 'matrica');
      show('grp-video', t === 'video');
      show('grp-audio', t === 'audio');
      show('grp-image', t === 'obicno' || t === 'broj' || t === 'piksel' || t === 'audio' || t === 'uljez');
      m('lbl-choice').textContent = t === 'uljez' ? '4 pojma · označi ULJEZA' : 'Odgovori · označi tačan';
      m('lbl-image').textContent = t === 'piksel' ? 'Slika (obavezno — to je pitanje)' : 'Slika (opciono)';
      const optional = ['emoji', 'dopuna', 'anagram', 'piksel', 'uljez', 'domino', 'matrica'].indexOf(t) >= 0;
      m('lbl-text').textContent = optional ? 'Tekst pitanja (opciono)' : 'Tekst pitanja';
    };
    m('q-type').onchange = () => applyType(m('q-type').value);

    const showImg = () => {
      const src = pend.imgData || (pend.imgFile ? '/k-files/' + ed.slug + '/' + pend.imgFile : '');
      m('q-img-prev').innerHTML = src
        ? '<img class="mediaprev" alt="" src="' + esc(src) + '"><button type="button" class="btn btn-ghost btn-sm" id="q-img-x" style="margin-top:.4rem">Ukloni sliku</button>'
        : '';
      const x = m('q-img-x');
      if (x)
        x.onclick = () => {
          pend.imgData = null;
          pend.imgFile = null;
          showImg();
        };
    };
    const takeImg = async (f) => {
      if (!f) return;
      try {
        pend.imgData = await resizeImage(f, 1280);
        pend.imgFile = null;
        showImg();
      } catch (e) {
        toast(e.message, true);
      }
    };
    m('q-img-drop').onclick = () => m('q-img').click();
    m('q-img-drop').ondragover = (e) => e.preventDefault();
    m('q-img-drop').ondrop = (e) => {
      e.preventDefault();
      takeImg(e.dataTransfer.files && e.dataTransfer.files[0]);
    };
    m('q-img').onchange = () => takeImg(m('q-img').files[0]);
    m('q-aud').onchange = async () => {
      const f = m('q-aud').files[0];
      if (!f) return;
      if (f.type.indexOf('audio/') !== 0) return toast('Izaberi audio fajl.', true);
      if (f.size > 5_000_000) return toast('Audio je prevelik (do 5 MB).', true);
      pend.audData = await readDataUrl(f);
      pend.audFile = null;
      pend.audName = f.name;
      m('q-aud-name').textContent = f.name + ' ✓';
    };

    const reset = (keepType) => {
      const t = keepType ? m('q-type').value : 'obicno';
      $$('input.field, textarea.field', bg).forEach((el) => (el.value = ''));
      $('input[name=correct][value="0"]', bg).checked = true;
      m('q-aud').value = '';
      m('q-aud-name').textContent = '';
      pend.imgData = pend.imgFile = pend.audData = pend.audFile = null;
      m('q-type').value = t;
      applyType(t);
      showImg();
      m('q-text').focus();
    };

    // Prefill when editing.
    if (existing) {
      const q = existing.question;
      const t = q.type || 'obicno';
      m('q-type').value = t;
      applyType(t);
      m('q-text').value = q.text || '';
      if (q.options) {
        q.options.forEach((o, i) => (m('q-opt' + i).value = o));
        const rd = $('input[name=correct][value="' + (q.correctIndex || 0) + '"]', bg);
        if (rd) rd.checked = true;
      }
      if (t === 'broj') {
        m('q-b-ans').value = q.answer;
        m('q-b-min').value = q.min;
        m('q-b-max').value = q.max;
        m('q-b-unit').value = q.unit || '';
      }
      if (t === 'emoji') {
        m('q-e-emojis').value = q.emojis || '';
        m('q-e-ans').value = q.answer || '';
        m('q-e-accept').value = (q.accept || []).join(', ');
        m('q-e-cat').value = q.category || '';
      }
      if (t === 'dopuna') m('q-d-quote').value = q.quote || '';
      if (t === 'dopuna' || t === 'anagram' || t === 'piksel') {
        m('q-ta-ans').value = q.answer || '';
        m('q-ta-accept').value = (q.accept || []).join(', ');
      }
      if (t === 'redosled') m('q-items').value = (q.items || []).join('\n');
      if (t === 'domino') {
        m('q-dom').value = (q.items || []).map((x) => x.label + ' | ' + x.value).join('\n');
        m('q-dom-lo').value = q.lowerLabel || '';
        m('q-dom-hi').value = q.higherLabel || '';
        m('q-dom-unit').value = q.unit || '';
      }
      if (t === 'matrica') {
        m('q-mx').value = (q.cells || []).join('\n');
        m('q-mx-ok').value = (q.correct || []).map((i) => i + 1).join(',');
        m('q-mx-ex').value = q.explanation || '';
      }
      if (t === 'video') {
        m('q-v-id').value = q.videoId || '';
        m('q-v-start').value = q.startSeconds != null ? q.startSeconds : '';
        m('q-v-end').value = q.endSeconds != null ? q.endSeconds : '';
      }
      pend.imgFile = q.imageFile || null;
      pend.audFile = q.audioFile || null;
      if (pend.audFile) m('q-aud-name').textContent = 'Postojeći zvuk ✓';
      showImg();
    } else {
      applyType('obicno');
    }

    const fail = (msg) => {
      const el = m('m-err');
      el.textContent = msg;
      el.hidden = false;
      return null;
    };
    const lines = (id) =>
      m(id)
        .value.split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const accept = (id) => {
      const arr = m(id)
        .value.split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      return arr.length ? arr.slice(0, 8) : null;
    };
    const ytId = (v) => {
      v = (v || '').trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const mm = v.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/v\/)([A-Za-z0-9_-]{11})/);
      return mm ? mm[1] : '';
    };

    /** Form → manifest question (media still pending). Mirrors /kviz-generator. */
    const build = () => {
      const t = m('q-type').value;
      const text = m('q-text').value.trim();
      const q = { type: t };
      const choice = (needFour) => {
        const sel = $('input[name=correct]:checked', bg);
        const slot = sel ? parseInt(sel.value, 10) : 0;
        const opts = [];
        let ci = -1;
        for (let i = 0; i < 4; i++) {
          const v = m('q-opt' + i).value.trim();
          if (!v) continue;
          if (i === slot) ci = opts.length;
          opts.push(v);
        }
        if (needFour && opts.length !== 4) return fail('Uljez mora imati tačno 4 pojma.');
        if (!needFour && opts.length < 2) return fail('Unesi bar 2 odgovora.');
        if (ci < 0) return fail('Označi tačan odgovor među popunjenim poljima.');
        if (!needFour && !text) return fail('Unesi tekst pitanja.');
        if (text) q.text = text;
        q.options = opts;
        q.correctIndex = ci;
        return q;
      };
      if (t === 'obicno' && !choice(false)) return null;
      if (t === 'uljez' && !choice(true)) return null;
      if (t === 'audio') {
        if (!choice(false)) return null;
        if (!pend.audData && !pend.audFile) return fail('Dodaj audio fajl.');
      }
      if (t === 'video') {
        if (!choice(false)) return null;
        const id = ytId(m('q-v-id').value);
        if (!id) return fail('Unesi ispravan YouTube link ili ID.');
        q.videoId = id;
        const s = m('q-v-start').value.trim();
        const e = m('q-v-end').value.trim();
        if (s) q.startSeconds = parseInt(s, 10);
        if (e) q.endSeconds = parseInt(e, 10);
      }
      if (t === 'broj') {
        if (!text) return fail('Unesi tekst pitanja.');
        q.text = text;
        const a = parseFloat(m('q-b-ans').value);
        const mn = parseFloat(m('q-b-min').value);
        const mx = parseFloat(m('q-b-max').value);
        if ([a, mn, mx].some((x) => isNaN(x))) return fail('Popuni odgovor, min i max.');
        if (mn >= mx) return fail('Min mora biti manji od max.');
        if (a < mn || a > mx) return fail('Odgovor mora biti između min i max.');
        q.answer = a;
        q.min = mn;
        q.max = mx;
        const u = m('q-b-unit').value.trim();
        if (u) q.unit = u;
      }
      if (t === 'emoji') {
        if (text) q.text = text;
        q.emojis = m('q-e-emojis').value.trim();
        if (!q.emojis) return fail('Unesi emoji zagonetku.');
        q.answer = m('q-e-ans').value.trim();
        if (!q.answer) return fail('Unesi rešenje.');
        const acc = accept('q-e-accept');
        if (acc) q.accept = acc;
        const cat = m('q-e-cat').value.trim();
        if (cat) q.category = cat;
      }
      if (t === 'dopuna' || t === 'anagram' || t === 'piksel') {
        if (text) q.text = text;
        if (t === 'dopuna') {
          q.quote = m('q-d-quote').value.trim();
          if (!q.quote) return fail('Unesi vidljivi deo citata.');
        }
        if (t === 'piksel' && !pend.imgData && !pend.imgFile) return fail('Piksel pitanje mora imati sliku.');
        q.answer = m('q-ta-ans').value.trim();
        if (!q.answer) return fail('Unesi rešenje.');
        const acc = accept('q-ta-accept');
        if (acc) q.accept = acc;
      }
      if (t === 'redosled') {
        if (!text) return fail('Unesi tekst pitanja.');
        q.text = text;
        q.items = lines('q-items');
        if (q.items.length < 3 || q.items.length > 10) return fail('Redosled mora imati 3–10 pojmova.');
      }
      if (t === 'domino') {
        if (text) q.text = text;
        const items = [];
        const ls = lines('q-dom');
        if (ls.length < 3 || ls.length > 12) return fail('Domino mora imati 3–12 stavki.');
        for (let i = 0; i < ls.length; i++) {
          const pipe = ls[i].lastIndexOf('|');
          const label = pipe < 0 ? '' : ls[i].slice(0, pipe).trim();
          const value = pipe < 0 ? NaN : parseFloat(ls[i].slice(pipe + 1));
          if (!label || isNaN(value)) return fail('Stavka ' + (i + 1) + ': format „Naziv | vrednost".');
          if (items.length && items[items.length - 1].value === value) return fail('Susedne stavke ' + i + ' i ' + (i + 1) + ' imaju istu vrednost.');
          items.push({ label, value });
        }
        q.items = items;
        const lo = m('q-dom-lo').value.trim();
        const hi = m('q-dom-hi').value.trim();
        const un = m('q-dom-unit').value.trim();
        if (lo) q.lowerLabel = lo;
        if (hi) q.higherLabel = hi;
        if (un) q.unit = un;
      }
      if (t === 'matrica') {
        if (text) q.text = text;
        q.cells = lines('q-mx');
        if (q.cells.length !== 9) return fail('Matrica mora imati tačno 9 polja.');
        const raw = m('q-mx-ok').value.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x));
        if (raw.length !== 3 || raw.some((x) => x < 1 || x > 9) || new Set(raw).size !== 3) return fail('Unesi tačno 3 različita polja (1–9).');
        q.correct = raw.map((x) => x - 1);
        const ex = m('q-mx-ex').value.trim();
        if (ex) q.explanation = ex;
      }
      return q;
    };

    const upload = async (data, kind) => {
      const r = await api('POST', '/api/k/' + ed.slug + '/upload', { data, kind }, ed.token);
      return r.file;
    };

    const submit = async (again) => {
      m('m-err').hidden = true;
      const q = build();
      if (!q) return;
      const btns = $$('.modal-acts button', bg);
      btns.forEach((b) => (b.disabled = true));
      try {
        const t = q.type;
        const wantsImg = t === 'obicno' || t === 'broj' || t === 'piksel' || t === 'audio' || t === 'uljez';
        if (wantsImg && pend.imgData) {
          pend.imgFile = await upload(pend.imgData, 'image');
          pend.imgData = null;
        }
        if (wantsImg && pend.imgFile) q.imageFile = pend.imgFile;
        if (t === 'audio') {
          if (pend.audData) {
            pend.audFile = await upload(pend.audData, 'audio');
            pend.audData = null;
          }
          q.audioFile = pend.audFile;
        }
        if (existing) {
          existing.question = q;
        } else {
          const id = Math.random().toString(36).slice(2, 10);
          d.own.push({ id, question: q });
          if (d.items.length < MAX_ITEMS) d.items.push('own:' + id);
        }
        markDirty();
        onDone();
        toast(existing ? 'Pitanje izmenjeno — ne zaboravi „Sačuvaj kviz".' : 'Pitanje dodato u kviz.');
        if (again) reset(true);
        else close();
      } catch (e) {
        fail(e.message);
      } finally {
        btns.forEach((b) => (b.disabled = false));
      }
    };
    m('m-add').onclick = () => submit(false);
    if (m('m-more')) m('m-more').onclick = () => submit(true);
    setTimeout(() => m('q-text').focus(), 30);
  }

  // ---- Brending tab ------------------------------------------------------------------------------

  function renderBrandTab(body) {
    const d = ed.draft;
    body.innerHTML =
      '<div class="basics" style="max-width:1100px;margin:0 auto"><div style="display:flex;flex-direction:column;gap:1.1rem">' +
      '<div class="card"><h2>📝 Naziv</h2><label class="lbl" for="name">Naziv kviza *</label>' +
      '<input class="field" id="name" maxlength="60" value="' + esc(d.name) + '">' +
      '<p class="hint">Link ostaje isti: <b class="mono">' + esc(linkShort(ed.slug)) + '</b></p></div>' +
      '<div class="card"><h2>🎨 Brending</h2><div id="brand-fields">' + brandHtml(d) + '</div></div>' +
      '<div style="display:flex;gap:.6rem;align-items:center"><span class="dirty" hidden>● Nesačuvane izmene</span><span style="flex:1"></span>' +
      '<button class="btn btn-gold" id="save">Sačuvaj brending</button></div>' +
      '</div><div class="preview-col"><span>Pregled na telefonu</span><div id="preview">' + phonePreview(d) + '</div></div></div>';
    const preview = () => {
      $('#preview', body).innerHTML = phonePreview(d);
      markDirty();
    };
    bindBrand(body, d, preview);
    $('#name', body).oninput = (e) => {
      d.name = e.target.value;
      preview();
    };
    $('#save', body).onclick = async (e) => {
      if (!d.name.trim()) return toast('Unesi naziv kviza.', true);
      d.name = d.name.trim();
      d.message = (d.message || '').trim();
      if (await save(['name', 'emoji', 'color', 'message', 'cover'], e.currentTarget)) renderEditorShell();
    };
  }

  // ---- Rok i PIN tab ---------------------------------------------------------------------------------

  function renderTermsTab(body) {
    const d = ed.draft;
    body.innerHTML =
      '<div class="narrow">' +
      '<div class="card"><h2>📅 Rok važenja</h2><div class="row2">' +
      '<div><label class="lbl" for="from" style="margin-top:0">Važi od</label><input class="field" type="datetime-local" id="from" value="' + toLocalInput(d.validFrom) + '"></div>' +
      '<div><label class="lbl" for="to" style="margin-top:0">Ističe</label><input class="field" type="datetime-local" id="to" value="' + toLocalInput(d.expiresAt) + '"></div></div>' +
      '<p class="hint">Sada: ' + esc(fmtDateTime(d.validFrom)) + ' – ' + esc(fmtDateTime(d.expiresAt)) + '. Posle isteka link prikazuje rezultate, ali nove partije ne mogu da počnu.</p>' +
      '<div style="margin-top:.9rem"><button class="btn btn-gold" id="save-dates">Sačuvaj rok</button></div></div>' +
      '<div class="card"><h2>🔑 Promeni PIN</h2><div class="pin-row">' + pinHtml([], 'new-pin') +
      '<p class="hint">Novi PIN važi odmah; drugi uređaji moraju da ga unesu ponovo.</p></div>' +
      '<div style="margin-top:.9rem"><button class="btn btn-primary" id="save-pin">Promeni PIN</button></div></div>' +
      '<div class="card danger-zone"><h2>🗑 Obriši kviz link</h2><p class="hint" style="margin-top:0">Briše pitanja, sliku i statistiku. Link prestaje da radi. Ne može da se vrati.</p>' +
      '<div style="margin-top:.9rem"><button class="btn btn-danger" id="del">Obriši zauvek</button></div></div>' +
      '</div>';
    $('#save-dates', body).onclick = async (e) => {
      const from = fromLocalInput($('#from', body).value);
      const to = fromLocalInput($('#to', body).value);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return toast('Unesi oba datuma.', true);
      if (to <= from) return toast('Datum isteka mora biti posle početka.', true);
      d.validFrom = from;
      d.expiresAt = to;
      if (await save(['validFrom', 'expiresAt'], e.currentTarget)) renderEditorShell();
    };
    const getPin = bindPin($('#new-pin', body));
    $('#save-pin', body).onclick = async () => {
      const pin = getPin();
      if (!/^\d{4}$/.test(pin)) return toast('PIN mora imati 4 cifre.', true);
      try {
        const r = await api('POST', '/api/k/' + ed.slug + '/pin', { pin }, ed.token);
        ed.token = r.token;
        rememberLink(ed.slug, r.token, ed.link.name);
        $$('#new-pin input', body).forEach((i) => (i.value = ''));
        toast('PIN je promenjen. Zapiši ga.');
      } catch (e) {
        toast(e.message, true);
      }
    };
    $('#del', body).onclick = async () => {
      const typed = prompt('Za brisanje upiši naziv linka: ' + ed.slug);
      if (typed == null) return;
      if (typed.trim() !== ed.slug) return toast('Naziv se ne poklapa — ništa nije obrisano.', true);
      try {
        await api('DELETE', '/api/k/' + ed.slug, undefined, ed.token);
        forgetLink(ed.slug);
        ed.dirty = false;
        location.href = '/k';
      } catch (e) {
        toast(e.message, true);
      }
    };
  }

  // ---- 1f: statistics -----------------------------------------------------------------------------------

  function renderStatsTab(body) {
    body.innerHTML = '<div class="loading">Učitavam statistiku…</div>';
    Promise.all([api('GET', '/api/k/' + ed.slug + '/stats', undefined, ed.token), loadBank().catch(() => null)])
      .then(([r]) => drawStats(body, r.games || [], 'all', null))
      .catch((e) => (body.innerHTML = '<div class="loading">' + esc(e.message) + '</div>'));
  }

  function drawStats(body, games, filter, picked) {
    if (!games.length) {
      body.innerHTML =
        '<div class="narrow"><div class="empty" style="margin-top:2rem">Još niko nije odigrao ovaj kviz. Statistika se puni posle svake partije.</div></div>';
      return;
    }
    const sel = filter === 'all' ? games : [games[filter]];

    // Players: one row per name (across the selected games).
    const byName = new Map();
    sel.forEach((g, gi) => {
      g.players.forEach((p) => {
        const row = byName.get(p.name) || { name: p.name, emoji: p.emoji, color: p.color, correct: 0, total: 0, points: 0, last: null };
        row.correct += p.correct;
        row.total += g.questions.length;
        row.points += p.points;
        row.last = { game: g, player: p };
        byName.set(p.name, row);
      });
    });
    const players = [...byName.values()].sort((a, b) => b.points - a.points);
    if (!picked || !byName.has(picked)) picked = players.length ? players[0].name : null;

    // Questions: % correct among those who answered, hardest first.
    const byKey = new Map();
    sel.forEach((g) => {
      g.questions.forEach((q, qi) => {
        const k = q.key || q.text;
        const row = byKey.get(k) || { key: q.key, text: q.text, type: q.type, answered: 0, correct: 0 };
        g.players.forEach((p) => {
          const r = p.results[qi];
          if (r === null || r === undefined) return;
          row.answered++;
          if (r === 1) row.correct++;
        });
        byKey.set(k, row);
      });
    });
    const qs = [...byKey.values()]
      .map((q) => Object.assign(q, { pct: q.answered ? Math.round((100 * q.correct) / q.answered) : 0 }))
      .sort((a, b) => a.pct - b.pct);

    const pick = picked ? byName.get(picked) : null;
    const chips = pick
      ? pick.last.player.results
          .map((r, i) => '<span class="' + (r === 1 ? 'ok1' : r === 0 ? 'ok0' : 'okn') + '" title="' + esc(pick.last.game.questions[i].text) + '">' + (i + 1) + '</span>')
          .join('')
      : '';

    body.innerHTML =
      '<div class="stats">' +
      '<div class="card"><div class="card-head"><h2>Igrači</h2>' +
      '<label class="hint" style="margin:0">Partija: <select id="game">' +
      '<option value="all">sve (' + games.length + ')</option>' +
      games
        .map((g, i) => ({ g, i }))
        .reverse()
        .map((x) => '<option value="' + x.i + '"' + (String(filter) === String(x.i) ? ' selected' : '') + '>' + esc(fmtDateTime(x.g.at)) + ' · ' + x.g.players.length + ' igr.</option>')
        .join('') +
      '</select></label></div>' +
      '<div class="ptable-h"><span></span><span>Ime</span><span>Tačno</span><span>Poeni</span></div><div class="prows">' +
      players
        .map(
          (p, i) =>
            '<button class="prow' + (i === 0 ? ' top' : '') + (p.name === picked ? ' picked' : '') + '" data-name="' + esc(p.name) + '">' +
            '<span class="face" style="background:' + esc(p.color) + '">' + esc(p.emoji) + '</span>' +
            '<span class="nm">' + esc(p.name) + '</span><span>' + p.correct + '/' + p.total + '</span>' +
            '<span class="pts">' + p.points.toLocaleString('sr-RS') + '</span></button>'
        )
        .join('') +
      '</div>' +
      (pick
        ? '<div class="perq"><b>' + esc(pick.name) + ' · po pitanjima' + (filter === 'all' && sel.length > 1 ? ' (poslednja partija)' : '') + '</b><div>' + chips + '</div></div>'
        : '') +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>Pitanja · najteža prva</h2><span class="hint" style="margin:0">% tačnih odgovora</span></div>' +
      '<div class="qstats">' +
      qs
        .map((q) => {
          const own = q.key && q.key.indexOf('own:') === 0;
          const bar = q.pct < 35 ? 'var(--red)' : q.pct < 65 ? 'var(--gold)' : 'var(--green)';
          return (
            '<div class="qstat"><div style="min-width:0"><div class="tx">' + esc(q.text) + '</div>' +
            '<div class="mt">' + (own ? '🔒 Privatno' : esc((TYPE[q.type] || { chip: q.type }).chip)) + ' · ' + q.answered + ' odgovora</div></div>' +
            '<div class="bar"><div style="width:' + q.pct + '%;background:' + bar + '"></div></div><span class="pc">' + q.pct + '%</span></div>'
          );
        })
        .join('') +
      '</div><div style="display:flex;gap:.5rem;margin-top:1rem"><button class="btn btn-ghost btn-sm" id="csv">⬇ Izvezi CSV</button></div></div>' +
      '</div>';

    $('#game', body).onchange = (e) => {
      const v = e.target.value;
      drawStats(body, games, v === 'all' ? 'all' : parseInt(v, 10), picked);
    };
    $$('.prow', body).forEach((b) => (b.onclick = () => drawStats(body, games, filter, b.dataset.name)));
    $('#csv', body).onclick = () => exportCsv(sel);
  }

  function exportCsv(games) {
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['partija', 'vreme', 'igrac', 'poeni', 'tacno', 'odgovoreno', 'pitanje_br', 'pitanje', 'tip', 'rezultat']];
    games.forEach((g, gi) => {
      g.players.forEach((p) => {
        g.questions.forEach((q, qi) => {
          const r = p.results[qi];
          rows.push([gi + 1, fmtDateTime(g.at), p.name, p.points, p.correct, p.answered, qi + 1, q.text, q.type, r === 1 ? 'tacno' : r === 0 ? 'netacno' : '']);
        });
      });
    });
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = ed.slug + '-statistika.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  // ---- 1e: done -------------------------------------------------------------------------------------------

  function renderDone() {
    const l = ed.link;
    const pub = ed.pub;
    document.title = 'Link je spreman · ' + l.name;
    let pin = '';
    try {
      pin = sessionStorage.getItem('kviz-pin-' + l.slug) || '';
    } catch (e) {
      pin = '';
    }
    const meta = [
      l.items.length + ' pitanja',
      l.order === 'random' ? 'nasumično ' + pub.questionCount : 'fiksan redosled',
      l.timeLimit ? l.timeLimit + ' s po pitanju' : 'vreme po pitanju',
      'važi ' + fmtRange(l.validFrom, l.expiresAt),
    ].join(' · ');
    app.innerHTML =
      '<div class="shell"><div class="shell-pad"><div class="shell-title">Novi kviz link</div><a class="back" href="/k">← Moji linkovi</a></div>' +
      stepsHtml(4) +
      '<div class="done"><div style="display:flex;flex-direction:column;gap:.2rem"><span class="kicker">Link je spreman</span>' +
      '<span class="big">' + esc(l.emoji) + ' ' + esc(l.name) + '</span><span class="hint" style="margin:0;font-size:.88rem">' + esc(meta) + '</span></div>' +
      '<div class="card done-grid"><div class="qr" id="qr">QR kod<br>linka</div>' +
      '<div style="display:flex;flex-direction:column;gap:.55rem;min-width:0">' +
      '<span class="lbl" style="margin:0">Link za igrače</span>' +
      '<div class="copyrow"><span class="mono">' + esc(linkShort(l.slug)) + '</span><button class="btn btn-gold btn-sm" id="copy">Kopiraj</button></div>' +
      '<span class="lbl" style="margin:.2rem 0 0">PIN za uređivanje</span>' +
      (pin
        ? '<div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap"><span class="pinshow">' + esc(pin.split('').join(' ')) + '</span>' +
          '<span style="font-size:.76rem;color:var(--red);font-weight:700">Zapiši ga — ne možemo da ga pošaljemo ponovo.</span></div>'
        : '<span class="hint" style="margin:0">PIN koji si izabrao na prvom koraku. Zapamćen je i u ovom pregledaču.</span>') +
      '</div></div>' +
      '<div style="display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn btn-primary" style="flex:1;min-height:48px" id="share">Podeli link</button>' +
      '<a class="btn btn-ghost" style="flex:1;min-height:48px" href="/k/' + esc(l.slug) + '" target="_blank" rel="noopener">Probaj kao igrač</a></div>' +
      '<div style="display:flex;gap:.6rem;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="/k/' + esc(l.slug) + '/uredi">Nazad na uređivanje</a>' +
      '<a class="btn btn-ghost btn-sm" href="/k">Moji linkovi</a></div>' +
      '</div></div>';
    $('#copy').onclick = async () => {
      if (await copyText(linkUrl(l.slug))) toast('Link je kopiran.');
    };
    $('#share').onclick = () => shareLink(l.slug, l.name);
    drawQr($('#qr'), linkUrl(l.slug));
  }

  function drawQr(el, text) {
    const tryDraw = (left) => {
      if (typeof window.qrcode === 'function') {
        try {
          const qr = window.qrcode(0, 'M');
          qr.addData(text);
          qr.make();
          el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        } catch (e) {
          /* keep the placeholder */
        }
      } else if (left > 0) {
        setTimeout(() => tryDraw(left - 1), 150);
      }
    };
    tryDraw(20);
  }

  // ---- Router -------------------------------------------------------------------------------------------------

  const path = location.pathname.replace(/\/+$/, '');
  const edit = /^\/k\/([a-z0-9-]+)\/uredi$/.exec(path);
  if (path === '/k/novi') renderBasics();
  else if (edit) openEditor(edit[1]);
  else renderList();
})();
