/* =============================================================================
   Mezőberény App — buildless kliensoldali alkalmazás.

   Két adatforrás:
     data/news.json — a scraper tölti óránként (GitHub Actions)
     data/info.json — kézzel szerkesztett, statikus tartalom
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ Nav --

  var NAV = [
    { id: 'hirek',         label: 'Hírek',          icon: 'i-news',     route: '#/hirek' },
    { id: 'esemenyek',     label: 'Események',      icon: 'i-calendar', route: '#/esemenyek' },
    { id: 'intezmenyek',   label: 'Intézmények',    icon: 'i-building', route: '#/intezmenyek' },
    { id: 'elerhetosegek', label: 'Elérhetőségek',  icon: 'i-phone',    route: '#/elerhetosegek' },
    { id: 'egyeb',         label: 'Egyéb',          icon: 'i-grid',     route: '#/egyeb' }
  ];

  var INFO_SECTIONS = {
    esemenyek: {
      title: 'Események',
      sub: 'Városi programok és rendezvények',
      kind: 'events'
    },
    intezmenyek: {
      title: 'Intézmények',
      sub: 'Hivatalok, iskolák, szolgáltatók',
      kind: 'directory',
      // Ebben a sorrendben jelennek meg a kategóriák; a listán kívüli
      // kategóriák a végére kerülnek, így új kategória is működik.
      order: ['Városháza', 'Orlai ház', 'Óvoda', 'Oktatás', 'Iskola',
              'Egészségügy', 'Humánsegítő'],
      linkLabel: 'Tovább az intézmény weboldalára'
    },
    elerhetosegek: {
      title: 'Elérhetőségek',
      sub: 'Kapcsolat és ügyfélfogadás',
      kind: 'directory',
      order: ['Önkormányzat', 'Városháza', 'Óvodák', 'Orlai ház',
              'Humánsegítő/Városüzemeltetés'],
      linkLabel: 'Tovább a weboldalra'
    },
    egyeb: {
      title: 'Egyéb',
      sub: 'Linkek és kapcsolat',
      kind: 'misc'
    }
  };

  // A hírfrissítés hibája esetén megjelenő tájékoztató szöveg.
  var NEWS_PROBLEM_TEXT =
    'Probléma adódott az utolsó hírek lekérése során. Elképzelhető, hogy a ' +
    'weboldalon karbantartás folyik. Hamarosan frissítjük a hírfolyamot.';

  var view = document.getElementById('view');

  // ---------------------------------------------------------------- Utils --

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(name, cls) {
    return '<svg class="' + (cls || 'icon') + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<use href="#' + name + '"/></svg>';
  }

  /** Determinisztikus szín a kategória nevéből — placeholder háttérhez. */
  function categoryHue(name) {
    var hash = 0;
    var text = String(name || '');
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % 360;
    }
    return hash;
  }

  function categoryStyle(name) {
    var hue = categoryHue(name);
    return '--c1:hsl(' + hue + ' 62% 58%);--c2:hsl(' + ((hue + 38) % 360) + ' 58% 30%)';
  }

  function initial(text) {
    var clean = String(text || '?').trim();
    return clean ? clean.charAt(0).toUpperCase() : '?';
  }

  /**
   * Kép vagy kategóriaszínű, betűs helykitöltő.
   * options.thumb — a kisebb listakép kérése
   * options.eager — a nyitóképet azonnal töltjük (nem lazy), mert ez a
   *   legnagyobb, elsőként látható elem; görgetőkonténerben a lazy amúgy
   *   sem töltené be megbízhatóan.
   */
  function media(item, options) {
    var config = options || {};
    var url = config.thumb
      ? (item.thumb_url || item.image_url)
      : (item.image_url || item.thumb_url);

    var img = url
      ? '<img class="media__img" src="' + esc(url) + '" alt="" decoding="async" ' +
        (config.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"') +
        ' onerror="this.remove()">'
      : '';

    // A helykitöltő a kép MÖGÖTT marad: ha a betöltés elbukik, az onerror
    // eltávolítja az <img>-et, és a kategóriaszínű háttér válik láthatóvá.
    return '<div class="media ' + (config.cls || '') + '" style="' +
      categoryStyle(item.category) + '">' +
      '<div class="media__ph" aria-hidden="true"><span class="media__ph-letter">' +
      esc(initial(item.category)) + '</span></div>' + img + '</div>';
  }

  function parseDate(value) {
    if (!value) return null;
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  /*
   * Minden időpontot Europe/Budapest szerint jelenítünk meg, függetlenül
   * attól, hol nézik az oldalt: egy városi esemény 17:00-kor kezdődik akkor
   * is, ha a látogató másik időzónában van. A böngésző alapértelmezés
   * szerint a helyi zónában formázna, ezért adjuk meg kifejezetten.
   */
  var TZ = 'Europe/Budapest';

  function tzFormat(date, options) {
    try {
      var config = { timeZone: TZ };
      for (var key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          config[key] = options[key];
        }
      }
      return new Intl.DateTimeFormat(options.locale || 'hu-HU', config).format(date);
    } catch (error) {
      return null; // Nagyon régi böngésző: a hívó helyi időre esik vissza.
    }
  }

  /** [év, hónap, nap] a budapesti naptár szerint. */
  function tzDateParts(date) {
    var text = tzFormat(date, {
      locale: 'en-CA', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    if (!text) {
      return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    }
    return text.split('-').map(Number);
  }

  function tzTime(date) {
    var text = tzFormat(date, {
      locale: 'en-GB', hour: '2-digit', minute: '2-digit', hour12: false
    });
    return text || (String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0'));
  }

  /** "3 órája", "tegnap", "2026. 08. 12." — a kortól függően. */
  function relativeTime(value) {
    var date = parseDate(value);
    if (!date) return '';
    var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'most';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' perce';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' órája';
    // Naptári napokban számolunk, hogy a "tegnap" tényleg tegnapot jelentsen.
    var days = -(daysUntil(value) || 0);
    if (days <= 0) return hours + ' órája';
    if (days === 1) return 'tegnap';
    if (days < 7) return days + ' napja';
    if (days < 30) return Math.floor(days / 7) + ' hete';
    return formatDate(value);
  }

  function formatDate(value) {
    var date = parseDate(value);
    if (!date) return '';
    var parts = tzDateParts(date);
    return parts[0] + '. ' + String(parts[1]).padStart(2, '0') + '. ' +
      String(parts[2]).padStart(2, '0') + '.';
  }

  /** Hány naptári nap választ el a megadott naptól (negatív = múlt). */
  function daysUntil(value) {
    var date = parseDate(value);
    if (!date) return null;
    function midnight(parts) {
      return Date.UTC(parts[0], parts[1] - 1, parts[2]);
    }
    var target = midnight(tzDateParts(date));
    var today = midnight(tzDateParts(new Date()));
    return Math.round((target - today) / 86400000);
  }

  function countdownLabel(days) {
    if (days === null) return '';
    if (days < 0) return 'Véget ért';
    if (days === 0) return 'Ma';
    if (days === 1) return 'Holnap';
    return days + ' nap múlva';
  }

  /** "2026. 09. 20., szombat 17:00" — az esemény teljes időpontja. */
  function formatEventDate(value) {
    var date = parseDate(value);
    if (!date) return '';
    var weekday = tzFormat(date, { weekday: 'long' });
    var time = tzTime(date);
    var text = formatDate(value) + (weekday ? ', ' + weekday : '');
    // A 00:00 azt jelenti, hogy csak dátumot adtak meg — ilyenkor nincs óra.
    if (time && time !== '00:00') text += ' ' + time;
    return text;
  }

  function formatDateTime(value) {
    var date = parseDate(value);
    if (!date) return '';
    return formatDate(value) + ' ' + tzTime(date);
  }

  /**
   * Pehelysúlyú szövegformázó a kézzel írt `content` mezőhöz.
   * Előbb escape-el, utána enged **félkövért**, *dőltet*, [link](url)-t,
   * "- " listát és üres sorral elválasztott bekezdéseket.
   */
  function formatContent(text) {
    if (!text) return '';
    var blocks = String(text).replace(/\r\n/g, '\n').split(/\n{2,}/);
    return blocks.map(function (block) {
      var trimmed = block.trim();
      if (!trimmed) return '';

      var lines = trimmed.split('\n');
      var isList = lines.every(function (line) { return /^\s*[-*]\s+/.test(line); });
      if (isList) {
        return '<ul>' + lines.map(function (line) {
          return '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>';
        }).join('') + '</ul>';
      }

      if (/^>\s?/.test(trimmed)) {
        var quoted = lines.map(function (line) {
          return line.replace(/^>\s?/, '');
        }).join('\n');
        return '<blockquote><p>' + inline(quoted).replace(/\n/g, '<br>') + '</p></blockquote>';
      }

      var heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
      if (heading) {
        var level = heading[1].length;
        return '<h' + level + '>' + inline(heading[2]) + '</h' + level + '>';
      }

      return '<p>' + inline(trimmed).replace(/\n/g, '<br>') + '</p>';
    }).join('');

    function inline(raw) {
      return esc(raw)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\)/g,
          function (all, label, href) {
            var external = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
            return '<a href="' + esc(href) + '"' + external + '>' + label + '</a>';
          })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    }
  }

  // ------------------------------------------------------------ Bookmarks --

  var BOOKMARK_KEY = 'mb.bookmarks';

  function readBookmarks() {
    try {
      var raw = localStorage.getItem(BOOKMARK_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function toggleBookmark(id) {
    var list = readBookmarks();
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1); else list.push(id);
    try {
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list));
    } catch (error) { /* privát mód: a mentés kihagyható */ }
    return index < 0;
  }

  function isBookmarked(id) {
    return readBookmarks().indexOf(id) >= 0;
  }

  // ------------------------------------------------------------------ Data --

  var store = { news: null, info: null, status: null };

  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error(path + ' — HTTP ' + response.status);
      return response.json();
    });
  }

  function loadNews() {
    if (store.news) return Promise.resolve(store.news);
    return loadJSON('data/news.json').then(function (data) {
      var articles = (data && Array.isArray(data.articles) ? data.articles : [])
        .filter(function (article) { return article && article.title && article.id; });
      articles.sort(function (a, b) {
        return String(b.published_at || '').localeCompare(String(a.published_at || ''));
      });
      store.news = { lastUpdated: data && data.last_updated, articles: articles };
      return store.news;
    });
  }

  function loadInfo() {
    if (store.info) return Promise.resolve(store.info);
    return loadJSON('data/info.json').then(function (data) {
      var items = (data && Array.isArray(data.items) ? data.items : [])
        .filter(function (item) { return item && item.title && item.id; });
      store.info = {
        lastUpdated: data && data.last_updated,
        links: (data && data.links) || {},
        items: items
      };
      return store.info;
    }).catch(function () {
      // Az info.json hiánya vagy hibás JSON ne törje el az alkalmazást.
      store.info = { lastUpdated: null, links: {}, items: [] };
      return store.info;
    });
  }

  /**
   * A scraper írja a data/status.json-t. Ha a legutóbbi hírfrissítés
   * elbukott, tájékoztató sávot jelenítünk meg — a meglévő hírek közben
   * továbbra is olvashatók maradnak.
   */
  function loadStatus() {
    if (store.status) return Promise.resolve(store.status);
    return loadJSON('data/status.json').then(function (data) {
      store.status = { ok: !data || data.ok !== false };
      return store.status;
    }).catch(function () {
      // Hiányzó status.json nem jelent hibát (pl. első futás előtt).
      store.status = { ok: true };
      return store.status;
    });
  }

  function newsBanner(status) {
    if (!status || status.ok) return '';
    return '<div class="banner" role="status">' +
      '<span class="banner__icon">' + icon('i-alert') + '</span>' +
      '<span>' + esc(NEWS_PROBLEM_TEXT) + '</span>' +
      '</div>';
  }

  // ------------------------------------------------------------ Components --

  function orgMark(size) {
    return '<span class="' + (size === 'lg' ? 'source__mark' : 'orgmark') + '" aria-hidden="true">' +
      icon('i-building') + '</span>';
  }

  function heroCard(article) {
    return '<a class="hero__card" href="#/hir/' + esc(article.id) + '">' +
      media(article, { eager: true }) +
      '<span class="badge hero__badge">' + esc(article.category || 'Hír') + '</span>' +
      '<div class="hero__body">' +
        '<div class="hero__meta">' + orgMark() +
          '<span>' + esc(article.source_name || 'Önkormányzat') + '</span>' +
          '<span class="dot-sep"></span>' +
          '<span>' + esc(relativeTime(article.published_at)) + '</span>' +
        '</div>' +
        '<h3 class="hero__title">' + esc(article.title) + '</h3>' +
      '</div>' +
    '</a>';
  }

  function articleRow(article) {
    return '<a class="row" href="#/hir/' + esc(article.id) + '">' +
      media(article, { cls: 'row__media', thumb: true }) +
      '<div class="row__body">' +
        '<div class="row__cat">' + esc(article.category || 'Hír') + '</div>' +
        '<h3 class="row__title">' + esc(article.title) + '</h3>' +
        '<div class="row__meta">' + orgMark() +
          '<span class="row__meta-name">' + esc(article.source_name || 'Önkormányzat') + '</span>' +
          '<span class="dot-sep"></span>' +
          '<span>' + esc(formatDate(article.published_at)) + '</span>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function infoRow(item) {
    var updated = item.updated_at ? 'Frissítve: ' + formatDate(item.updated_at) : '';
    return '<a class="row" href="#/info/' + esc(item.id) + '">' +
      media(item, { cls: 'row__media', thumb: true }) +
      '<div class="row__body">' +
        '<div class="row__cat">' + esc(item.category || 'Infó') + '</div>' +
        '<h3 class="row__title">' + esc(item.title) + '</h3>' +
        (item.excerpt ? '<p class="row__excerpt">' + esc(item.excerpt) + '</p>' : '') +
        '<div class="row__meta">' +
          (item.pinned ? '<span class="badge badge--pin">' + icon('i-pin') + 'Kiemelt</span>' : '') +
          (updated ? '<span>' + esc(updated) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function pills(values, active, attribute) {
    return '<div class="pills" role="group" aria-label="Kategória szűrő">' +
      values.map(function (value) {
        var selected = value === active;
        return '<button type="button" class="pill" ' + attribute + '="' + esc(value) + '"' +
          ' aria-pressed="' + selected + '">' + esc(value) + '</button>';
      }).join('') + '</div>';
  }

  function stateBlock(iconName, title, text, actionHtml) {
    return '<div class="state">' +
      '<div class="state__mark">' + icon(iconName) + '</div>' +
      '<p class="state__title">' + esc(title) + '</p>' +
      '<p class="state__text">' + esc(text) + '</p>' +
      (actionHtml || '') + '</div>';
  }

  function skeletonList(count) {
    var rows = '';
    for (var i = 0; i < count; i++) {
      rows += '<div class="row"><div class="row__media skeleton"></div>' +
        '<div class="row__body">' +
        '<div class="skeleton" style="width:34%;height:11px;margin-bottom:9px"></div>' +
        '<div class="skeleton" style="width:92%;height:14px;margin-bottom:6px"></div>' +
        '<div class="skeleton" style="width:64%;height:14px;margin-bottom:11px"></div>' +
        '<div class="skeleton" style="width:44%;height:10px"></div>' +
        '</div></div>';
    }
    return '<div class="list">' + rows + '</div>';
  }

  function topbar(options) {
    var config = options || {};
    var left = config.back
      ? '<a class="icon-btn" href="' + esc(config.back) + '" aria-label="Vissza">' + icon('i-back') + '</a>'
      : '<button type="button" class="icon-btn topbar__menu" data-nav-toggle aria-label="Menü">' +
        icon('i-menu') + '</button>';
    return '<div class="topbar">' + left + '<div class="topbar__spacer"></div>' +
      (config.search === false ? '' :
        '<a class="icon-btn" href="#/felfedezes" aria-label="Keresés">' + icon('i-search') + '</a>') +
      '<button type="button" class="icon-btn icon-btn--badge" data-notify aria-label="Értesítések">' +
        icon('i-bell') + '</button>' +
      '</div>';
  }

  function footerNote(lastUpdated, extra) {
    return '<div class="footer-note">' +
      '<span>' + (lastUpdated
        ? 'Utolsó frissítés: ' + esc(formatDateTime(lastUpdated))
        : 'Mezőberény App') + '</span>' +
      '<span>' + (extra || 'Forrás: <a href="https://mezobereny.hu" target="_blank" rel="noopener">mezobereny.hu</a>') + '</span>' +
      '</div>';
  }

  // ---------------------------------------------------------------- Views --

  function renderNewsHome() {
    view.innerHTML = topbar() + '<div class="container">' + skeletonList(4) + '</div>';

    Promise.all([loadNews(), loadStatus()]).then(function (loaded) {
      var data = loaded[0];
      var banner = newsBanner(loaded[1]);
      var articles = data.articles;

      if (!articles.length) {
        view.innerHTML = topbar() + '<div class="container">' + banner +
          stateBlock('i-inbox', 'Még nincsenek hírek',
            'A hírek munkanapokon 8 és 18 óra között frissülnek a ' +
            'mezobereny.hu oldalról. Nézz vissza később.') +
          footerNote(data.lastUpdated) + '</div>';
        return;
      }

      var featured = articles.slice(0, 5);
      var rest = articles.slice(5, 17);

      view.innerHTML = topbar() +
        '<div class="container">' + banner +
          '<div class="section-head">' +
            '<h2 class="section-head__title">Friss hírek</h2>' +
            '<a class="section-head__link" href="#/felfedezes">Összes</a>' +
          '</div>' +
          '<div class="hero"><div class="hero__track" id="hero-track">' +
            featured.map(heroCard).join('') +
          '</div><div class="hero__dots" id="hero-dots">' +
            featured.map(function (_, index) {
              return '<span class="hero__dot" aria-current="' + (index === 0) + '"></span>';
            }).join('') +
          '</div></div>' +

          '<div class="section-head">' +
            '<h2 class="section-head__title">Ajánló</h2>' +
            '<a class="section-head__link" href="#/felfedezes">Összes</a>' +
          '</div>' +
          '<div class="list grid">' + rest.map(articleRow).join('') + '</div>' +
          footerNote(data.lastUpdated) +
        '</div>';

      bindHeroDots();
    }).catch(renderDataError);
  }

  function bindHeroDots() {
    var track = document.getElementById('hero-track');
    var dots = document.getElementById('hero-dots');
    if (!track || !dots) return;
    var cards = track.children;

    track.addEventListener('scroll', function () {
      var center = track.scrollLeft + track.clientWidth / 2;
      var closest = 0;
      var best = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var mid = cards[i].offsetLeft + cards[i].offsetWidth / 2;
        var distance = Math.abs(mid - center);
        if (distance < best) { best = distance; closest = i; }
      }
      for (var j = 0; j < dots.children.length; j++) {
        dots.children[j].setAttribute('aria-current', String(j === closest));
      }
    }, { passive: true });
  }

  function renderDiscover() {
    view.innerHTML = topbar({ back: '#/hirek', search: false }) +
      '<div class="container">' + skeletonList(5) + '</div>';

    Promise.all([loadNews(), loadStatus()]).then(function (loaded) {
      var data = loaded[0];
      var banner = newsBanner(loaded[1]);
      var categories = ['Összes'];
      data.articles.forEach(function (article) {
        var name = article.category || 'Általános';
        if (categories.indexOf(name) < 0) categories.push(name);
      });

      var activeCategory = 'Összes';
      var query = '';

      view.innerHTML = topbar({ back: '#/hirek', search: false }) +
        '<div class="container">' + banner +
          '<div class="page-head">' +
            '<h1 class="page-head__title">Felfedezés</h1>' +
            '<p class="page-head__sub">Mezőberény hírei egy helyen · ' +
              data.articles.length + ' hír</p>' +
          '</div>' +
          '<div class="search">' +
            '<div class="search__field">' + icon('i-search') +
              '<input class="search__input" id="q" type="search" ' +
              'placeholder="Keresés a hírek között" aria-label="Keresés a hírek között">' +
            '</div>' +
            '<button type="button" class="search__filter" id="filter-toggle" ' +
              'aria-pressed="false" aria-label="Szűrők">' + icon('i-sliders') + '</button>' +
          '</div>' +
          pills(categories, activeCategory, 'data-cat') +
          '<div class="list grid" id="results"></div>' +
          footerNote(data.lastUpdated) +
        '</div>';

      var results = document.getElementById('results');
      var input = document.getElementById('q');

      function apply() {
        var needle = query.trim().toLowerCase();
        var filtered = data.articles.filter(function (article) {
          if (activeCategory !== 'Összes' && (article.category || 'Általános') !== activeCategory) {
            return false;
          }
          if (!needle) return true;
          return (article.title + ' ' + (article.excerpt || '')).toLowerCase().indexOf(needle) >= 0;
        });

        results.innerHTML = filtered.length
          ? filtered.map(articleRow).join('')
          : stateBlock('i-search', 'Nincs találat',
              'Próbálj másik kifejezést vagy válassz másik kategóriát.');
      }

      view.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-cat]');
        if (!pill) return;
        activeCategory = pill.getAttribute('data-cat');
        view.querySelectorAll('[data-cat]').forEach(function (node) {
          node.setAttribute('aria-pressed', String(node === pill));
        });
        apply();
      });

      input.addEventListener('input', function () {
        query = input.value;
        apply();
      });

      document.getElementById('filter-toggle').addEventListener('click', function () {
        input.focus();
      });

      apply();
    }).catch(renderDataError);
  }

  function renderArticle(id) {
    view.innerHTML = '<div class="container">' + skeletonList(1) + '</div>';

    loadNews().then(function (data) {
      var article = data.articles.filter(function (item) { return item.id === id; })[0];
      if (!article) {
        view.innerHTML = topbar({ back: '#/hirek' }) + '<div class="container">' +
          stateBlock('i-alert', 'A hír nem található',
            'Lehet, hogy már lekerült a listáról.',
            '<p style="margin-top:18px"><a class="readmore" href="#/hirek">Vissza a hírekhez</a></p>') +
          '</div>';
        return;
      }

      var saved = isBookmarked(article.id);

      view.innerHTML = '<article class="article">' +
        '<div class="article__hero" style="' + categoryStyle(article.category) + '">' +
          media(article, { eager: true }) +
          '<div class="floatbar">' +
            '<a class="float-btn" href="#/hirek" aria-label="Vissza">' + icon('i-back') + '</a>' +
            '<span class="floatbar__spacer"></span>' +
            '<button type="button" class="float-btn" id="bookmark" aria-pressed="' + saved + '" ' +
              'aria-label="Mentés">' + icon('i-bookmark') + '</button>' +
            '<a class="float-btn" href="' + esc(article.url) + '" target="_blank" rel="noopener" ' +
              'aria-label="Megnyitás az eredeti oldalon">' + icon('i-external') + '</a>' +
          '</div>' +
          '<div class="article__hero-body">' +
            '<span class="badge">' + esc(article.category || 'Hír') + '</span>' +
            '<h1 class="article__hero-title">' + esc(article.title) + '</h1>' +
            '<div class="article__hero-meta">' + icon('i-clock') +
              '<span>' + esc(relativeTime(article.published_at)) + '</span>' +
              '<span class="dot-sep"></span>' +
              '<span>' + esc(formatDateTime(article.published_at)) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="article__sheet">' +
          '<div class="article__aside">' +
            '<div class="source">' + orgMark('lg') +
              '<div>' +
                '<div class="source__name">' + esc(article.source_name || 'Önkormányzat') +
                  icon('i-shield') + '</div>' +
                '<div class="source__sub">' +
                  esc(article.author ? 'Közzétette: ' + article.author : 'Mezőberény Város') +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="prose">' +
              (article.excerpt
                ? '<p>' + esc(article.excerpt) + '</p>'
                : '<p>Ehhez a hírhez a városi oldal nem közölt bevezető szöveget — ' +
                  'a teljes tartalom az eredeti cikkben olvasható.</p>') +
            '</div>' +
            '<a class="readmore" href="' + esc(article.url) + '" target="_blank" rel="noopener">' +
              'Teljes cikk a mezobereny.hu-n' + icon('i-external') + '</a>' +
          '</div>' +
        '</div>' +
      '</article>';

      document.getElementById('bookmark').addEventListener('click', function () {
        this.setAttribute('aria-pressed', String(toggleBookmark(article.id)));
      });
    }).catch(renderDataError);
  }

  /* ---- Események: közelgők visszaszámlálóval, alattuk a lezajlottak ---- */

  function eventRow(item, past) {
    var days = daysUntil(item.event_date);
    var label = countdownLabel(days);
    var when = formatEventDate(item.event_date);

    return '<a class="row' + (past ? ' row--past' : '') + '" href="#/info/' +
      esc(item.id) + '">' +
      media(item, { cls: 'row__media', thumb: true }) +
      '<div class="row__body">' +
        '<div class="row__cat">' + esc(item.category || 'Esemény') + '</div>' +
        '<h3 class="row__title">' + esc(item.title) + '</h3>' +
        (item.excerpt ? '<p class="row__excerpt">' + esc(item.excerpt) + '</p>' : '') +
        '<div class="row__meta">' +
          (label
            ? '<span class="countdown' + (past ? ' countdown--past' : '') + '">' +
              esc(label) + '</span>'
            : '') +
          (when
            ? icon('i-calendar') + '<span>' + esc(when) + '</span>'
            : '<span>Időpont később</span>') +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function renderEvents(sectionId) {
    var meta = INFO_SECTIONS[sectionId];
    view.innerHTML = topbar({ search: false }) +
      '<div class="container">' + skeletonList(4) + '</div>';

    loadInfo().then(function (data) {
      var items = data.items.filter(function (item) {
        return item.section === sectionId;
      });

      var head = '<div class="page-head">' +
        '<h1 class="page-head__title">' + esc(meta.title) + '</h1>' +
        '<p class="page-head__sub">' + esc(meta.sub) + '</p></div>';

      if (!items.length) {
        view.innerHTML = topbar({ search: false }) + '<div class="container">' + head +
          stateBlock('i-calendar', 'Még nincs meghirdetett esemény',
            'Az események a data/info.json fájlban szerkeszthetők, közvetlenül a GitHubon.') +
          footerNote(data.lastUpdated, 'Kézzel szerkesztett tartalom') + '</div>';
        return;
      }

      // Közelgő: legközelebbi elöl. Lezajlott: a legutóbbi elöl.
      // Az időpont nélküli bejegyzések a közelgők végére kerülnek.
      var upcoming = [];
      var past = [];
      items.forEach(function (item) {
        var days = daysUntil(item.event_date);
        if (days === null || days >= 0) upcoming.push(item); else past.push(item);
      });

      function byDate(direction) {
        return function (a, b) {
          var left = a.event_date || '9999';
          var right = b.event_date || '9999';
          return direction * String(left).localeCompare(String(right));
        };
      }
      upcoming.sort(byDate(1));
      past.sort(byDate(-1));

      var categories = ['Összes'];
      items.forEach(function (item) {
        var name = item.category || 'Egyéb';
        if (categories.indexOf(name) < 0) categories.push(name);
      });
      var activeCategory = 'Összes';

      view.innerHTML = topbar({ search: false }) +
        '<div class="container">' + head +
          (categories.length > 2 ? pills(categories, activeCategory, 'data-icat') : '') +
          '<div id="info-results"></div>' +
          footerNote(data.lastUpdated, 'Kézzel szerkesztett tartalom') +
        '</div>';

      var results = document.getElementById('info-results');

      function apply() {
        function match(item) {
          return activeCategory === 'Összes' ||
            (item.category || 'Egyéb') === activeCategory;
        }
        var shownUpcoming = upcoming.filter(match);
        var shownPast = past.filter(match);
        var html = '';

        if (shownUpcoming.length) {
          html += '<div class="list grid grid--wide">' +
            shownUpcoming.map(function (item) { return eventRow(item, false); }).join('') +
            '</div>';
        } else {
          html += stateBlock('i-calendar', 'Nincs közelgő esemény',
            'Ebben a kategóriában jelenleg nincs meghirdetett program.');
        }

        if (shownPast.length) {
          html += '<section class="past-block">' +
            '<div class="section-head">' +
              '<h2 class="section-head__title">Véget ért események</h2>' +
            '</div>' +
            '<div class="list grid grid--wide">' +
              shownPast.map(function (item) { return eventRow(item, true); }).join('') +
            '</div></section>';
        }

        results.innerHTML = html;
      }

      bindCategoryPills(apply, function (value) { activeCategory = value; });
      apply();
    }).catch(renderDataError);
  }

  /* ---- Intézmények / Elérhetőségek: kategóriákba rendezett névsor ---- */

  /** A rögzített sorrend szerint rendezi a kategóriákat, a többit a végére. */
  function sortCategories(names, order) {
    var known = order || [];
    return names.slice().sort(function (a, b) {
      var indexA = known.indexOf(a);
      var indexB = known.indexOf(b);
      if (indexA < 0 && indexB < 0) return a.localeCompare(b, 'hu');
      if (indexA < 0) return 1;
      if (indexB < 0) return -1;
      return indexA - indexB;
    });
  }

  function directoryRow(item) {
    return '<a class="row" href="#/info/' + esc(item.id) + '">' +
      media(item, { cls: 'row__media', thumb: true }) +
      '<div class="row__body">' +
        '<div class="row__cat">' + esc(item.category || 'Egyéb') + '</div>' +
        '<h3 class="row__title">' + esc(item.title) + '</h3>' +
        (item.excerpt ? '<p class="row__excerpt">' + esc(item.excerpt) + '</p>' : '') +
        (item.address || item.phone
          ? '<div class="row__meta">' +
            (item.address ? icon('i-map-pin') + '<span>' + esc(item.address) + '</span>'
                          : icon('i-phone') + '<span>' + esc(item.phone) + '</span>') +
            '</div>'
          : '') +
      '</div>' +
    '</a>';
  }

  function renderDirectory(sectionId) {
    var meta = INFO_SECTIONS[sectionId];
    view.innerHTML = topbar({ search: false }) +
      '<div class="container">' + skeletonList(4) + '</div>';

    loadInfo().then(function (data) {
      var items = data.items.filter(function (item) {
        return item.section === sectionId;
      });

      var head = '<div class="page-head">' +
        '<h1 class="page-head__title">' + esc(meta.title) + '</h1>' +
        '<p class="page-head__sub">' + esc(meta.sub) + '</p></div>';

      if (!items.length) {
        view.innerHTML = topbar({ search: false }) + '<div class="container">' + head +
          stateBlock('i-inbox', 'Ez a rovat még üres',
            'A tartalom a data/info.json fájlban szerkeszthető, közvetlenül a GitHubon.') +
          footerNote(data.lastUpdated, 'Kézzel szerkesztett tartalom') + '</div>';
        return;
      }

      var present = [];
      items.forEach(function (item) {
        var name = item.category || 'Egyéb';
        if (present.indexOf(name) < 0) present.push(name);
      });
      var ordered = sortCategories(present, meta.order);
      var activeCategory = 'Összes';

      view.innerHTML = topbar({ search: false }) +
        '<div class="container">' + head +
          pills(['Összes'].concat(ordered), activeCategory, 'data-icat') +
          '<div id="info-results"></div>' +
          footerNote(data.lastUpdated, 'Kézzel szerkesztett tartalom') +
        '</div>';

      var results = document.getElementById('info-results');

      function apply() {
        if (activeCategory !== 'Összes') {
          var filtered = items.filter(function (item) {
            return (item.category || 'Egyéb') === activeCategory;
          });
          results.innerHTML = '<div class="list grid">' +
            filtered.map(directoryRow).join('') + '</div>';
          return;
        }

        // "Összes" nézetben kategóriánként csoportosítunk, hogy egy hosszú
        // intézménylista is átlátható maradjon.
        results.innerHTML = ordered.map(function (name) {
          var group = items.filter(function (item) {
            return (item.category || 'Egyéb') === name;
          });
          return '<div class="section-head">' +
            '<h2 class="section-head__title">' + esc(name) + '</h2>' +
            '<span class="section-head__count">' + group.length + '</span></div>' +
            '<div class="list grid">' + group.map(directoryRow).join('') + '</div>';
        }).join('');
      }

      bindCategoryPills(apply, function (value) { activeCategory = value; });
      apply();
    }).catch(renderDataError);
  }

  /** A kategória-pillek eseménykezelője — mindhárom infó nézet használja. */
  function bindCategoryPills(apply, setActive) {
    view.addEventListener('click', function (event) {
      var pill = event.target.closest('[data-icat]');
      if (!pill) return;
      setActive(pill.getAttribute('data-icat'));
      view.querySelectorAll('[data-icat]').forEach(function (node) {
        node.setAttribute('aria-pressed', String(node === pill));
      });
      apply();
    });
  }

  /* ---- Egyéb: külső linkek és a fejlesztő elérhetőségei ---- */

  function linkRow(options) {
    var body = '<span class="linkrow__icon linkrow__icon--' + options.tone + '">' +
      icon(options.icon) + '</span>' +
      '<span class="linkrow__label">' + esc(options.label) + '</span>';

    if (!options.href) {
      // Még nincs megadva URL (pl. a Facebook oldal címe) — a sor látszik,
      // de nem kattintható, így nem visz sehova félrevezetően.
      return '<div class="linkrow linkrow--disabled">' + body +
        '<span class="linkrow__note">Hamarosan</span></div>';
    }

    return '<a class="linkrow" href="' + esc(options.href) + '" target="_blank" ' +
      'rel="noopener">' + body +
      '<span class="linkrow__go">' + icon('i-chevron') + '</span></a>';
  }

  function renderMisc(sectionId) {
    var meta = INFO_SECTIONS[sectionId];
    view.innerHTML = topbar({ search: false }) +
      '<div class="container">' + skeletonList(2) + '</div>';

    loadInfo().then(function (data) {
      var links = data.links || {};
      var extras = data.items.filter(function (item) {
        return item.section === sectionId;
      });

      var developerName = links.developer_name || 'Gál András';
      var developerUrl = links.developer_url || '';
      var developerMail = links.developer_email || '';

      view.innerHTML = topbar({ search: false }) +
        '<div class="container">' +
          '<div class="page-head">' +
            '<h1 class="page-head__title">' + esc(meta.title) + '</h1>' +
            '<p class="page-head__sub">' + esc(meta.sub) + '</p>' +
          '</div>' +

          '<div class="linklist">' +
            linkRow({
              icon: 'i-facebook', tone: 'fb', label: 'A Város Facebook oldala',
              href: links.facebook_url
            }) +
            linkRow({
              icon: 'i-globe', tone: 'web', label: 'A város hivatalos honlapja',
              href: links.website_url || 'https://mezobereny.hu'
            }) +
          '</div>' +

          '<div class="dev">' +
            '<h2 class="dev__title">Alkalmazás fejlesztő</h2>' +
            '<div class="dev__row">' +
              '<span class="dev__name">' + esc(developerName) + '</span>' +
              (developerUrl
                ? '<a class="dev__btn dev__btn--go" href="' + esc(developerUrl) + '" ' +
                  'target="_blank" rel="noopener" aria-label="' + esc(developerName) +
                  ' oldala">' + icon('i-arrow-right') + '</a>'
                : '') +
              (developerMail
                ? '<a class="dev__btn" href="mailto:' + esc(developerMail) + '" ' +
                  'aria-label="E-mail a fejlesztőnek">' + icon('i-mail') + '</a>'
                : '') +
            '</div>' +
            '<p class="dev__note">Hiba illetve probléma esetén vegye fel a ' +
              'kapcsolatot a fejlesztővel a fenti elérhetőségek egyikén!</p>' +
          '</div>' +

          (extras.length
            ? '<div class="section-head">' +
              '<h2 class="section-head__title">További tudnivalók</h2></div>' +
              '<div class="list grid">' + extras.map(infoRow).join('') + '</div>'
            : '') +

          footerNote(data.lastUpdated, 'Kézzel szerkesztett tartalom') +
        '</div>';
    }).catch(renderDataError);
  }

  /** A részletnézet fejlécének metasora: eseménynél időpont, egyébként frissítés. */
  function detailHeroMeta(item) {
    if (item.event_date) {
      var days = daysUntil(item.event_date);
      var label = countdownLabel(days);
      return '<div class="article__hero-meta">' + icon('i-calendar') +
        '<span>' + esc(formatEventDate(item.event_date)) + '</span>' +
        (label
          ? '<span class="dot-sep"></span><span>' + esc(label) + '</span>'
          : '') +
        '</div>';
    }
    if (item.updated_at) {
      return '<div class="article__hero-meta">' + icon('i-refresh') +
        '<span>Frissítve: ' + esc(formatDate(item.updated_at)) + '</span></div>';
    }
    return '';
  }

  /** Kattintható kapcsolat-sorok: cím, telefon, e-mail. */
  function contactBlock(item) {
    var rows = '';
    if (item.address) {
      rows += '<div class="contact__row">' + icon('i-map-pin') +
        '<span>' + esc(item.address) + '</span></div>';
    }
    if (item.phone) {
      rows += '<a class="contact__row" href="tel:' +
        esc(String(item.phone).replace(/[^+0-9]/g, '')) + '">' + icon('i-phone') +
        '<span>' + esc(item.phone) + '</span></a>';
    }
    if (item.email) {
      rows += '<a class="contact__row" href="mailto:' + esc(item.email) + '">' +
        icon('i-mail') + '<span>' + esc(item.email) + '</span></a>';
    }
    return rows ? '<div class="contact">' + rows + '</div>' : '';
  }

  function renderInfoDetail(id) {
    view.innerHTML = '<div class="container">' + skeletonList(1) + '</div>';

    loadInfo().then(function (data) {
      var item = data.items.filter(function (entry) { return entry.id === id; })[0];
      if (!item) {
        view.innerHTML = topbar({ back: '#/esemenyek' }) + '<div class="container">' +
          stateBlock('i-alert', 'A bejegyzés nem található',
            'Lehet, hogy időközben törölték.') + '</div>';
        return;
      }

      var back = INFO_SECTIONS[item.section] ? '#/' + item.section : '#/egyeb';
      var saved = isBookmarked(item.id);

      view.innerHTML = '<article class="article">' +
        '<div class="article__hero" style="' + categoryStyle(item.category) + '">' +
          media(item, { eager: true }) +
          '<div class="floatbar">' +
            '<a class="float-btn" href="' + back + '" aria-label="Vissza">' + icon('i-back') + '</a>' +
            '<span class="floatbar__spacer"></span>' +
            '<button type="button" class="float-btn" id="bookmark" aria-pressed="' + saved + '" ' +
              'aria-label="Mentés">' + icon('i-bookmark') + '</button>' +
          '</div>' +
          '<div class="article__hero-body">' +
            '<span class="badge">' + esc(item.category || 'Infó') + '</span>' +
            '<h1 class="article__hero-title">' + esc(item.title) + '</h1>' +
            detailHeroMeta(item) +
          '</div>' +
        '</div>' +

        '<div class="article__sheet">' +
          '<div class="article__aside">' +
            '<div class="source">' + orgMark('lg') +
              '<div>' +
                '<div class="source__name">Mezőberény' + icon('i-shield') + '</div>' +
                '<div class="source__sub">' +
                  esc(INFO_SECTIONS[item.section] ? INFO_SECTIONS[item.section].title : 'Információ') +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="prose">' +
              (formatContent(item.content) ||
                (item.excerpt ? '<p>' + esc(item.excerpt) + '</p>' : '')) +
            '</div>' +
            contactBlock(item) +
            (item.website_url
              ? '<a class="readmore" href="' + esc(item.website_url) + '" ' +
                'target="_blank" rel="noopener">' +
                esc((INFO_SECTIONS[item.section] &&
                     INFO_SECTIONS[item.section].linkLabel) ||
                    'Tovább a weboldalra') + icon('i-external') + '</a>'
              : '') +
          '</div>' +
        '</div>' +
      '</article>';

      document.getElementById('bookmark').addEventListener('click', function () {
        this.setAttribute('aria-pressed', String(toggleBookmark(item.id)));
      });
    }).catch(renderDataError);
  }

  function renderDataError(error) {
    view.innerHTML = topbar({ search: false }) + '<div class="container">' +
      stateBlock('i-alert', 'Az adatok most nem érhetők el',
        'Nem sikerült betölteni a tartalmat. Ellenőrizd az internetkapcsolatot, ' +
        'majd próbáld újra.',
        '<p style="margin-top:18px"><button type="button" class="readmore" ' +
        'onclick="location.reload()">Újratöltés' + icon('i-refresh') + '</button></p>') +
      '</div>';
    if (window.console) console.error(error);
  }

  // --------------------------------------------------------------- Router --

  function activeNavId(hash) {
    if (hash.indexOf('#/hir/') === 0 || hash.indexOf('#/felfedezes') === 0) return 'hirek';
    var match = /^#\/([a-z]+)/.exec(hash);
    if (match && INFO_SECTIONS[match[1]]) return match[1];
    if (match && match[1] === 'info') return null;
    return 'hirek';
  }

  function renderNav(hash) {
    var active = activeNavId(hash);

    document.getElementById('tabbar').innerHTML = NAV.map(function (entry) {
      return '<a class="tab" href="' + entry.route + '"' +
        (entry.id === active ? ' aria-current="page"' : '') + '>' +
        icon(entry.icon) + '<span class="tab__label">' + esc(entry.label) + '</span></a>';
    }).join('');

    document.getElementById('sidebar-nav').innerHTML = NAV.map(function (entry) {
      return '<a class="navlink" href="' + entry.route + '"' +
        (entry.id === active ? ' aria-current="page"' : '') + '>' +
        icon(entry.icon) + '<span>' + esc(entry.label) + '</span></a>';
    }).join('');
  }

  function route() {
    var hash = location.hash || '#/hirek';
    renderNav(hash);

    var articleMatch = /^#\/hir\/(.+)$/.exec(hash);
    if (articleMatch) { renderArticle(decodeURIComponent(articleMatch[1])); return scrollTop(); }

    var infoMatch = /^#\/info\/(.+)$/.exec(hash);
    if (infoMatch) { renderInfoDetail(decodeURIComponent(infoMatch[1])); return scrollTop(); }

    var sectionMatch = /^#\/([a-z]+)/.exec(hash);
    var section = sectionMatch && sectionMatch[1];

    if (section === 'felfedezes') { renderDiscover(); return scrollTop(); }

    if (section && INFO_SECTIONS[section]) {
      var kind = INFO_SECTIONS[section].kind;
      if (kind === 'events') renderEvents(section);
      else if (kind === 'directory') renderDirectory(section);
      else renderMisc(section);
      return scrollTop();
    }

    renderNewsHome();
    return scrollTop();
  }

  function scrollTop() {
    window.scrollTo(0, 0);
  }

  // A hamburger gomb mobilon a felfedezés/kereső nézetre visz, ahol
  // minden kategória elérhető — külön fiókmenü nélkül.
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-nav-toggle]')) location.hash = '#/felfedezes';
    if (event.target.closest('[data-notify]')) location.hash = '#/hirek';
  });

  window.addEventListener('hashchange', route);

  loadNews().catch(function () { /* a nézet kezeli a hibát */ });
  route();

  // A lábléc-információ a desktop oldalsávban is megjelenik.
  loadNews().then(function (data) {
    var foot = document.getElementById('sidebar-foot');
    if (foot && data.lastUpdated) {
      foot.innerHTML = 'Frissítve<br><strong>' + esc(formatDateTime(data.lastUpdated)) + '</strong>';
    }
  }).catch(function () {});
})();
