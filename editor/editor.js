/* =============================================================================
   JSON szerkesztő a Mezőberény App tartalmához.

   Kizárólag a böngészőben fut, semmit nem küld el és semmit nem ment:
   a kimenetet a felhasználó másolja be a data/*.json fájlokba.
   ========================================================================== */
(function () {
  'use strict';

  var TZ = 'Europe/Budapest';

  // ------------------------------------------------------- Meződefiníciók --

  var INFO_CATEGORIES = {
    esemenyek: ['Programok', 'Kultúra', 'Sport', 'Rendszeres', 'Egyéb'],
    intezmenyek: ['Városháza', 'Orlai ház', 'Óvoda', 'Oktatás', 'Iskola',
                  'Egészségügy', 'Humánsegítő'],
    elerhetosegek: ['Önkormányzat', 'Városháza', 'Óvodák', 'Orlai ház',
                    'Humánsegítő/Városüzemeltetés'],
    egyeb: ['Ügyintézés', 'Közszolgáltatás', 'Nyitvatartás', 'Kapcsolat', 'Egyéb']
  };

  var NEWS_CATEGORIES = ['Napról napra', 'Városházi hírek', 'Felhívások', 'Programok',
    'Kultúra', 'Oktatás', 'Hitélet', 'Nemzetiségi hírek', 'Egyesületi, alapítványi hírek',
    'Szociális és egészségügy', 'Gazdaság', 'Sport', 'Innen-onnan', 'Időjárás',
    'Hirdetmény', 'Általános', 'Civil szervezet', 'Testvérváros'];

  var CONTENT_HINT =
    'Bekezdések között hagyj üres sort. Használható: **félkövér**, *dőlt*, ' +
    '## Alcím, - felsorolás, > kiemelt megjegyzés, [szöveg](https://…)';

  /** Melyik mezők tartoznak az adott szegmenshez/rovathoz. */
  function fieldsFor(segment, section) {
    if (segment === 'news') {
      return [
        { key: 'id', label: 'Azonosító (id)', required: true,
          hint: 'A hír számazonosítója a forrásoldal URL-jéből.' },
        { key: 'title', label: 'Cím', required: true },
        { key: 'url', label: 'Cikk URL-je', type: 'url', required: true, wide: true },
        { key: 'category', label: 'Kategória', list: NEWS_CATEGORIES },
        { key: 'source_name', label: 'Kibocsátó', placeholder: 'Önkormányzat' },
        { key: 'author', label: 'Szerző', placeholder: 'PmH. Titk.' },
        { key: 'published_at', label: 'Megjelenés ideje', type: 'datetime-local' },
        { key: 'image_url', label: 'Kép URL-je', type: 'url', wide: true },
        { key: 'thumb_url', label: 'Kis kép URL-je', type: 'url', wide: true,
          hint: 'Ha üres, a nagy kép lesz használva.' },
        { key: 'excerpt', label: 'Kivonat', type: 'textarea', rows: 3, wide: true }
      ];
    }

    var fields = [
      { key: 'id', label: 'Azonosító (id)', required: true,
        hint: 'Ékezet és szóköz nélkül, egyedi. A címből automatikusan kitöltődik.' },
      { key: 'category', label: 'Kategória', required: true, list: INFO_CATEGORIES[section] },
      { key: 'title', label: 'Cím', required: true, wide: true },
      { key: 'excerpt', label: 'Rövid leírás (listában látszik)', type: 'textarea',
        rows: 2, wide: true },
      { key: 'image_url', label: 'Kép URL-je', type: 'url', wide: true,
        hint: 'Üresen hagyva kategóriaszínű helykitöltő jelenik meg.' }
    ];

    if (section === 'esemenyek') {
      fields.push({ key: 'event_date', label: 'Esemény időpontja', type: 'datetime-local',
        hint: 'Budapesti idő. Ebből számolja az app a visszaszámlálót.' });
    } else {
      fields.push({ key: 'phone', label: 'Telefon', type: 'tel' });
      fields.push({ key: 'email', label: 'E-mail cím', type: 'email' });
      fields.push({ key: 'website_url', label: 'Webcím', type: 'url', wide: true });
      fields.push({ key: 'address', label: 'Cím', wide: true });
      fields.push({ key: 'updated_at', label: 'Frissítve', type: 'date',
        hint: 'Megjelenik a bejegyzésen. Üresen hagyható.' });
    }

    if (section === 'egyeb') {
      fields.push({ key: 'pinned', label: 'Kiemelt (a lista tetejére kerül)',
        type: 'checkbox' });
    }

    fields.push({ key: 'content', label: 'Teljes szöveg', type: 'textarea', rows: 8,
      wide: true, hint: CONTENT_HINT });

    return fields;
  }

  // ---------------------------------------------------------- Segédek -----

  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Ékezetes címből URL-barát azonosító. */
  function slugify(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /** Budapest UTC-eltolása az adott pillanatban ("+02:00" vagy "+01:00"). */
  function budapestOffset(date) {
    try {
      var text = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, timeZoneName: 'longOffset'
      }).format(date);
      var match = text.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
    } catch (error) { /* régi böngésző */ }
    return '+01:00';
  }

  /**
   * A datetime-local mező értékét budapesti falióra-időként értelmezi, és
   * ISO időbélyeggé alakítja a helyes (nyári/téli) eltolással.
   */
  function localToIso(value, dateOnly) {
    if (!value) return '';
    var base = dateOnly ? value + 'T00:00' : value;
    // Első közelítés: UTC-ként olvassuk, hogy megkapjuk a nagyjábóli pillanatot,
    // abból derül ki, hogy nyári vagy téli időszámítás van-e érvényben.
    var guess = new Date(base + 'Z');
    if (isNaN(guess.getTime())) return '';
    var offset = budapestOffset(guess);
    // Az eltolással korrigált pillanatra újra megnézzük — a DST-váltás
    // napján ez adja a helyes zónát.
    var corrected = new Date(base + offset);
    if (!isNaN(corrected.getTime())) offset = budapestOffset(corrected);
    return base + ':00' + offset;
  }

  /** ISO időbélyegből datetime-local mezőérték, budapesti idő szerint. */
  function isoToLocal(value, dateOnly) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(date).reduce(function (acc, part) {
        acc[part.type] = part.value; return acc;
      }, {});
      var day = parts.year + '-' + parts.month + '-' + parts.day;
      return dateOnly ? day : day + 'T' + parts.hour + ':' + parts.minute;
    } catch (error) {
      return value.slice(0, dateOnly ? 10 : 16);
    }
  }

  // ------------------------------------------------------------ Állapot ---

  var state = {
    segment: 'info',
    section: 'esemenyek',
    /** A betöltött teljes fájl (info.json vagy news.json), vagy null. */
    file: null,
    /** A szerkesztés alatt álló bejegyzés (másolat). */
    draft: null,
    /** A szerkesztett bejegyzés indexe a fájlban, vagy -1 ha új. */
    index: -1,
    output: 'entry'
  };

  function listKey() { return state.segment === 'news' ? 'articles' : 'items'; }
  function fileName() { return state.segment === 'news' ? 'news.json' : 'info.json'; }

  function entries() {
    if (!state.file) return [];
    var all = state.file[listKey()] || [];
    if (state.segment === 'news') return all;
    return all.filter(function (item) { return item.section === state.section; });
  }

  // -------------------------------------------------------------- Téma ----

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('mb.editor.theme'); } catch (error) { /* privát mód */ }
    if (!saved) {
      saved = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);

    $('theme-btn').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mb.editor.theme', next); } catch (error) { /* privát mód */ }
    });
  }

  // ----------------------------------------------------------- Betöltés ---

  function setStatus(node, text, kind) {
    node.textContent = text;
    node.className = 'status' + (kind ? ' status--' + kind : '');
  }

  function adoptFile(data, source) {
    var key = listKey();
    if (!data || typeof data !== 'object') throw new Error('A JSON nem objektum.');
    if (!Array.isArray(data[key])) {
      throw new Error('Hiányzik vagy nem tömb a "' + key + '" mező. ' +
        'Biztosan a ' + fileName() + ' tartalmát töltötted be?');
    }
    state.file = data;
    state.draft = null;
    state.index = -1;
    setStatus($('load-status'),
      data[key].length + ' bejegyzés betöltve (' + source + '). ' +
      'Ebben a rovatban: ' + entries().length + '.', 'ok');
    renderList();
    renderOutput();
  }

  function loadLive() {
    var path = '../data/' + fileName();
    setStatus($('load-status'), 'Betöltés…');
    fetch(path, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) { adoptFile(data, path); })
      .catch(function (error) {
        setStatus($('load-status'),
          'Nem sikerült betölteni a(z) ' + path + ' fájlt (' + error.message + '). ' +
          'Ha helyben, fájlból nyitottad meg a szerkesztőt, használd a ' +
          '„Fájl feltöltése” vagy a „JSON beillesztése” gombot.', 'err');
      });
  }

  // -------------------------------------------------------------- Lista ---

  function renderList() {
    var list = entries();
    var container = $('entry-list');
    $('list-count').textContent = list.length
      ? list.length + ' bejegyzés ebben a rovatban'
      : '';

    if (!list.length) {
      container.innerHTML = '<div class="empty">Nincs betöltött bejegyzés ebben a ' +
        'rovatban. Tölts be egy fájlt, vagy hozz létre újat.</div>';
      return;
    }

    container.innerHTML = list.map(function (item, position) {
      var meta = state.segment === 'news'
        ? (item.category || '—') + ' · ' + (item.published_at || '').slice(0, 10)
        : (item.category || '—') + ' · ' + item.id;
      var active = state.draft && state.draft.id === item.id ? ' entry--active' : '';
      return '<div class="entry' + active + '">' +
        '<div class="entry__body">' +
          '<div class="entry__title">' + esc(item.title || '(cím nélkül)') + '</div>' +
          '<div class="entry__meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<div class="entry__actions">' +
          '<button type="button" class="btn btn--icon" data-edit="' + position + '">Szerkeszt</button>' +
          '<button type="button" class="btn btn--icon" data-dup="' + position + '" ' +
            'title="Másolat">' +
            '<svg class="ic" viewBox="0 0 24 24"><use href="#e-copy"/></svg></button>' +
          '<button type="button" class="btn btn--icon btn--danger" data-del="' + position + '" ' +
            'title="Törlés">' +
            '<svg class="ic" viewBox="0 0 24 24"><use href="#e-trash"/></svg></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /** A rovatra szűrt listabeli pozícióból a teljes fájlbeli index. */
  function fileIndexOf(item) {
    return (state.file[listKey()] || []).indexOf(item);
  }

  // -------------------------------------------------------------- Űrlap ---

  function blankEntry() {
    var entry = {};
    if (state.segment === 'info') entry.section = state.section;
    fieldsFor(state.segment, state.section).forEach(function (field) {
      entry[field.key] = field.type === 'checkbox' ? false : '';
    });
    if (state.segment === 'news') entry.image_checked = true;
    return entry;
  }

  function renderForm() {
    var form = $('entry-form');
    if (!state.draft) { $('form-card').hidden = true; return; }
    $('form-card').hidden = false;

    var fields = fieldsFor(state.segment, state.section);
    form.innerHTML = '<div class="row">' + fields.map(function (field) {
      var value = state.draft[field.key];
      var id = 'f-' + field.key;
      var cls = 'field' + (field.wide || field.type === 'textarea' ? ' field--wide' : '');

      if (field.type === 'checkbox') {
        return '<label class="' + cls + '"><span class="check">' +
          '<input type="checkbox" id="' + id + '" data-key="' + field.key + '"' +
          (value ? ' checked' : '') + '>' + esc(field.label) + '</span></label>';
      }

      var control;
      if (field.type === 'textarea') {
        control = '<textarea id="' + id + '" data-key="' + field.key + '" rows="' +
          (field.rows || 4) + '">' + esc(value) + '</textarea>';
      } else if (field.type === 'datetime-local' || field.type === 'date') {
        control = '<input type="' + field.type + '" id="' + id + '" data-key="' +
          field.key + '" data-time="1" value="' +
          esc(isoToLocal(value, field.type === 'date')) + '">';
      } else {
        var listAttr = field.list ? ' list="dl-' + field.key + '"' : '';
        control = '<input type="' + (field.type || 'text') + '" id="' + id +
          '" data-key="' + field.key + '" value="' + esc(value) + '"' + listAttr +
          (field.placeholder ? ' placeholder="' + esc(field.placeholder) + '"' : '') + '>' +
          (field.list
            ? '<datalist id="dl-' + field.key + '">' + field.list.map(function (option) {
                return '<option value="' + esc(option) + '">';
              }).join('') + '</datalist>'
            : '');
      }

      return '<label class="' + cls + '" for="' + id + '">' +
        '<span class="field__label">' + esc(field.label) +
        (field.required ? ' *' : '') + '</span>' + control +
        (field.hint ? '<span class="field__hint">' + esc(field.hint) + '</span>' : '') +
        '</label>';
    }).join('') + '</div>';

    // A cím alapján automatikusan javasol azonosítót, amíg kézzel nem írták át.
    var titleInput = form.querySelector('[data-key="title"]');
    var idInput = form.querySelector('[data-key="id"]');
    if (titleInput && idInput && state.segment === 'info') {
      titleInput.addEventListener('input', function () {
        if (!idInput.dataset.touched) idInput.value = slugify(titleInput.value);
      });
      idInput.addEventListener('input', function () { idInput.dataset.touched = '1'; });
      if (idInput.value) idInput.dataset.touched = '1';
    }
  }

  function readForm() {
    var entry = {};
    if (state.segment === 'info') entry.section = state.section;

    fieldsFor(state.segment, state.section).forEach(function (field) {
      var node = $('f-' + field.key);
      if (!node) return;
      if (field.type === 'checkbox') { entry[field.key] = node.checked; return; }
      if (field.type === 'datetime-local' || field.type === 'date') {
        entry[field.key] = localToIso(node.value, field.type === 'date');
        return;
      }
      entry[field.key] = node.value.trim();
    });

    if (state.segment === 'news') {
      entry.image_checked = state.draft.image_checked !== false;
    }
    return entry;
  }

  function validate(entry) {
    var problems = [];
    fieldsFor(state.segment, state.section).forEach(function (field) {
      if (field.required && !entry[field.key]) {
        problems.push('A(z) „' + field.label + '” mező kötelező.');
      }
    });

    if (entry.id && !/^[A-Za-z0-9._~-]+$/.test(entry.id)) {
      problems.push('Az azonosító csak angol betűt, számot, kötőjelet, ' +
        'pontot vagy alulvonást tartalmazhat.');
    }

    // Ütközik-e másik bejegyzéssel? (A szerkesztett sajátjával nem.)
    if (entry.id && state.file) {
      var all = state.file[listKey()] || [];
      for (var i = 0; i < all.length; i++) {
        if (i !== state.index && all[i].id === entry.id) {
          problems.push('Ez az azonosító már foglalt: „' + entry.id + '”.');
          break;
        }
      }
    }

    ['image_url', 'thumb_url', 'website_url', 'url'].forEach(function (key) {
      if (entry[key] && !/^https?:\/\//i.test(entry[key])) {
        problems.push('A(z) „' + key + '” mezőnek http:// vagy https:// címmel kell kezdődnie.');
      }
    });

    if (entry.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.email)) {
      problems.push('Az e-mail cím formátuma nem megfelelő.');
    }
    return problems;
  }

  /** Üres mezők elhagyása, a séma szerinti sorrenddel. */
  function cleanEntry(entry) {
    var order = ['id', 'section', 'category', 'title', 'excerpt', 'url', 'image_url',
      'thumb_url', 'event_date', 'website_url', 'address', 'phone', 'email',
      'source_name', 'author', 'published_at', 'pinned', 'updated_at',
      'image_checked', 'content'];
    var out = {};
    order.forEach(function (key) {
      if (!(key in entry)) return;
      var value = entry[key];
      if (value === '' || value === null || value === undefined) {
        // A képmezőket kifejezett null-ként tartjuk meg, hogy látszódjon:
        // szándékosan nincs kép, nem elfelejtett mező.
        if (key === 'image_url' || key === 'thumb_url') out[key] = null;
        return;
      }
      out[key] = value;
    });
    return out;
  }

  // ------------------------------------------------------------ Kimenet ---

  function renderOutput() {
    var pre = $('output');
    var hint = $('out-hint');

    if (state.output === 'entry') {
      if (!state.draft) {
        pre.textContent = '—';
        hint.textContent = 'Válassz vagy hozz létre egy bejegyzést.';
        return;
      }
      hint.innerHTML = 'Ezt az objektumot illeszd be a <code>' + fileName() +
        '</code> fájl <code>"' + listKey() +
        '"</code> tömbjébe. A szomszédos elemek közé <strong>vessző</strong> kell!';
      pre.textContent = JSON.stringify(cleanEntry(state.draft), null, 2);
      return;
    }

    if (!state.file) {
      pre.textContent = '—';
      hint.textContent = 'A teljes fájl kimenetéhez előbb tölts be egy fájlt a 2. lépésben.';
      return;
    }
    hint.innerHTML = 'A <code>' + fileName() +
      '</code> teljes, kész tartalma — másold ki, és cseréld le vele a fájlt.';
    pre.textContent = JSON.stringify(state.file, null, 2) + '\n';
  }

  function copyOutput() {
    var text = $('output').textContent;
    if (!text || text === '—') return;
    var done = function () { setStatus($('copy-status'), 'Vágólapra másolva.', 'ok'); };
    var fail = function () { setStatus($('copy-status'), 'A másolás nem sikerült — jelöld ki kézzel.', 'err'); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
      return;
    }
    // Tartalék a régebbi / nem biztonságos kontextusban futó böngészőkhöz.
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy') ? done() : fail();
      document.body.removeChild(area);
    } catch (error) { fail(); }
  }

  function downloadOutput() {
    var text = $('output').textContent;
    if (!text || text === '—') return;
    var name = state.output === 'file' ? fileName() : 'bejegyzes.json';
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // -------------------------------------------------- Hírek a forrásból ---

  var CHROME_IMAGE_PATTERNS = ['/assets/images/', 'siklosi_istvan_polgarmester',
    'VJP_kozlemeny', 'ohp_banner', 'efop_', 'EFOP-'];

  function absolutize(url) {
    if (/^https?:\/\//i.test(url)) return url;
    return 'https://mezobereny.hu/' + String(url).replace(/^\/+/, '');
  }

  function cleanText(text) {
    return String(text || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function shorten(text, limit) {
    limit = limit || 260;
    if (text.length <= limit) return text;
    var cut = text.slice(0, limit).replace(/\s+$/, '');
    var space = cut.lastIndexOf(' ');
    if (space > limit * 0.6) cut = cut.slice(0, space);
    return cut.replace(/[\s,;:.-]+$/, '') + '…';
  }

  /**
   * A forrásoldal HTML-jéből hírobjektumokat állít elő.
   * Ugyanazt a szerkezetet olvassa, mint a scraper/scrape.py.
   */
  function parseNewsHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var boxes = doc.querySelectorAll('div.cikk_box');
    var out = [];

    Array.prototype.forEach.call(boxes, function (box) {
      var link = box.querySelector('h3 a[href]');
      if (!link) return;
      var url = link.getAttribute('href').trim();
      var match = url.match(/\/s\/hir\/(\d+)\//);
      if (!match) return;

      var params = {};
      Array.prototype.forEach.call(box.querySelectorAll('ul.params li'), function (item) {
        var text = cleanText(item.textContent);
        var colon = text.indexOf(':');
        if (colon < 0) return;
        params[text.slice(0, colon).trim().toLowerCase()] = text.slice(colon + 1).trim();
      });

      // Kivonat: a doboz közvetlen bekezdéseiből, azok híján a teljes szövegből.
      var parts = [];
      Array.prototype.forEach.call(box.children, function (child) {
        if (child.tagName !== 'P' || child.classList.contains('clear')) return;
        var text = cleanText(child.textContent);
        if (text) parts.push(text);
      });
      if (!parts.length) {
        var clone = box.cloneNode(true);
        Array.prototype.forEach.call(
          clone.querySelectorAll('h3, ul.params, .a_hir_tovabb'),
          function (node) { node.remove(); });
        parts.push(cleanText(clone.textContent));
      }

      var image = null;
      Array.prototype.forEach.call(box.querySelectorAll('img'), function (img) {
        if (image) return;
        var src = img.getAttribute('data-src') || img.getAttribute('src');
        if (!src) return;
        var isChrome = CHROME_IMAGE_PATTERNS.some(function (pattern) {
          return src.indexOf(pattern) >= 0;
        });
        if (!isChrome && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(src)) {
          image = absolutize(src.trim());
        }
      });

      var created = (params['létrehozva'] || '').match(
        /(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})/);
      var published = '';
      if (created) {
        published = localToIso(created[1] + '-' + created[2] + '-' + created[3] +
          'T' + ('0' + created[4]).slice(-2) + ':' + created[5]);
      }

      out.push({
        id: match[1],
        category: params['kategória'] || 'Általános',
        title: cleanText(link.textContent),
        excerpt: shorten(cleanText(parts.join(' '))),
        url: /^https?:/i.test(url) ? url : absolutize(url),
        image_url: image,
        thumb_url: image,
        source_name: params['kibocsátó'] || 'Önkormányzat',
        author: params['szerző'] || '',
        published_at: published,
        image_checked: false
      });
    });

    return out;
  }

  /** A beolvasott hírekkel frissíti a betöltött fájlt (meglévőket megtartva). */
  function mergeNews(fresh) {
    if (!state.file) {
      state.file = { last_updated: '', source_url: 'https://mezobereny.hu/s/hirek',
        articles: [] };
    }
    var existing = state.file.articles || [];
    var byId = {};
    existing.forEach(function (article) { byId[article.id] = article; });

    var added = 0;
    var updated = 0;
    fresh.forEach(function (article) {
      var previous = byId[article.id];
      if (previous) {
        // A korábban megtalált képet nem dobjuk el.
        article.image_url = previous.image_url || article.image_url;
        article.thumb_url = previous.thumb_url || article.thumb_url;
        article.image_checked = previous.image_checked;
        updated++;
      } else {
        added++;
      }
      byId[article.id] = article;
    });

    var merged = Object.keys(byId).map(function (key) { return byId[key]; });
    merged.sort(function (a, b) {
      return String(b.published_at || '').localeCompare(String(a.published_at || ''));
    });

    state.file.articles = merged.map(cleanEntry);
    state.file.last_updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    state.output = 'file';
    syncTabs();
    renderList();
    renderOutput();
    return { added: added, updated: updated, total: merged.length };
  }

  function reportMerge(result, source) {
    setStatus($('fetch-status'),
      result.total + ' hír összesen (' + result.added + ' új, ' +
      result.updated + ' meglévő frissítve) — ' + source +
      '. A „Teljes fájl” kimenetet másold a data/news.json helyére.', 'ok');
  }

  var PROXIES = [
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function (url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); }
  ];

  function fetchViaProxy(index) {
    var target = 'https://mezobereny.hu/s/hirek';
    if (index >= PROXIES.length) {
      setStatus($('fetch-status'),
        'Az automatikus lekérés nem sikerült (a külső átjárók nem válaszoltak). ' +
        'Használd a kézi módot — az mindig működik.', 'err');
      $('manual-box').hidden = false;
      return;
    }

    setStatus($('fetch-status'), 'Lekérés… (' + (index + 1) + '. átjáró)');
    fetch(PROXIES[index](target))
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (html) {
        var fresh = parseNewsHtml(html);
        if (!fresh.length) throw new Error('a válaszban nem volt feldolgozható hír');
        reportMerge(mergeNews(fresh), 'automatikus lekérés');
      })
      .catch(function () { fetchViaProxy(index + 1); });
  }

  // ------------------------------------------------------------ Kötések ---

  function syncTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.setAttribute('aria-pressed', String(tab.dataset.out === state.output));
    });
  }

  function syncSegment() {
    var isNews = state.segment === 'news';
    $('section-field').hidden = isNews;
    $('fetch-card').hidden = !isNews;
    // Szegmensváltáskor a betöltött fájl már nem illik az új szerkezethez.
    state.file = null;
    state.draft = null;
    state.index = -1;
    setStatus($('load-status'), 'Nincs betöltve semmi.');
    $('form-card').hidden = true;
    renderList();
    renderOutput();
  }

  function startEdit(item, index) {
    state.draft = JSON.parse(JSON.stringify(item));
    state.index = index;
    renderForm();
    renderList();
    state.output = 'entry';
    syncTabs();
    renderOutput();
    $('form-errors').textContent = '';
    $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bind() {
    $('segment').addEventListener('change', function () {
      state.segment = this.value;
      syncSegment();
    });

    $('section').addEventListener('change', function () {
      state.section = this.value;
      state.draft = null;
      state.index = -1;
      $('form-card').hidden = true;
      renderList();
      renderOutput();
    });

    $('load-live').addEventListener('click', loadLive);

    $('load-file').addEventListener('click', function () { $('file-input').click(); });

    $('file-input').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          adoptFile(JSON.parse(reader.result), file.name);
        } catch (error) {
          setStatus($('load-status'), 'Hibás JSON: ' + error.message, 'err');
        }
      };
      reader.readAsText(file);
      this.value = '';
    });

    $('load-paste').addEventListener('click', function () {
      $('paste-error').textContent = '';
      $('paste-json').value = '';
      $('paste-dialog').showModal();
    });

    $('paste-ok').addEventListener('click', function (event) {
      try {
        adoptFile(JSON.parse($('paste-json').value), 'beillesztett JSON');
      } catch (error) {
        event.preventDefault();
        $('paste-error').textContent = 'Hibás JSON: ' + error.message;
      }
    });

    $('new-entry').addEventListener('click', function () {
      startEdit(blankEntry(), -1);
    });

    $('entry-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-edit],[data-dup],[data-del]');
      if (!button) return;
      var list = entries();

      if (button.dataset.edit !== undefined) {
        var item = list[Number(button.dataset.edit)];
        startEdit(item, fileIndexOf(item));
        return;
      }

      if (button.dataset.dup !== undefined) {
        var source = list[Number(button.dataset.dup)];
        var copy = JSON.parse(JSON.stringify(source));
        copy.id = copy.id + '-masolat';
        copy.title = copy.title + ' (másolat)';
        startEdit(copy, -1);
        return;
      }

      var target = list[Number(button.dataset.del)];
      if (!confirm('Biztosan törlöd? „' + (target.title || target.id) + '”\n\n' +
          'Ez csak a szerkesztőben lévő listából törli — a fájlt neked kell frissítened.')) {
        return;
      }
      var index = fileIndexOf(target);
      if (index >= 0) state.file[listKey()].splice(index, 1);
      if (state.draft && state.draft.id === target.id) {
        state.draft = null;
        state.index = -1;
        $('form-card').hidden = true;
      }
      renderList();
      renderOutput();
    });

    $('entry-form').addEventListener('input', function () {
      if (!state.draft) return;
      state.draft = readForm();
      if (state.output === 'entry') renderOutput();
    });

    $('apply-entry').addEventListener('click', function () {
      var entry = readForm();
      var problems = validate(entry);
      if (problems.length) {
        $('form-errors').textContent = problems.join('\n');
        return;
      }
      $('form-errors').textContent = '';

      if (!state.file) {
        state.file = state.segment === 'news'
          ? { last_updated: '', source_url: 'https://mezobereny.hu/s/hirek', articles: [] }
          : { last_updated: '', links: {}, items: [] };
      }

      var clean = cleanEntry(entry);
      var all = state.file[listKey()];
      if (state.index >= 0) all[state.index] = clean;
      else { all.push(clean); state.index = all.length - 1; }

      state.draft = clean;
      setStatus($('copy-status'), 'A bejegyzés bekerült a listába.', 'ok');
      renderList();
      renderOutput();
    });

    $('cancel-entry').addEventListener('click', function () {
      state.draft = null;
      state.index = -1;
      $('form-card').hidden = true;
      renderList();
      renderOutput();
    });

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.output = tab.dataset.out;
        syncTabs();
        renderOutput();
      });
    });

    $('copy-out').addEventListener('click', copyOutput);
    $('download-out').addEventListener('click', downloadOutput);

    $('fetch-auto').addEventListener('click', function () { fetchViaProxy(0); });
    $('fetch-manual').addEventListener('click', function () {
      $('manual-box').hidden = !$('manual-box').hidden;
    });

    $('manual-parse').addEventListener('click', function () {
      var html = $('manual-html').value;
      if (!html.trim()) {
        setStatus($('fetch-status'), 'Illeszd be a forrásoldal HTML kódját.', 'err');
        return;
      }
      var fresh = parseNewsHtml(html);
      if (!fresh.length) {
        setStatus($('fetch-status'),
          'Nem találtam hírt a beillesztett kódban. Biztosan a /s/hirek oldal ' +
          'teljes forrását másoltad be?', 'err');
        return;
      }
      reportMerge(mergeNews(fresh), 'kézi feldolgozás');
    });
  }

  initTheme();
  bind();
  syncSegment();
  renderOutput();
})();
