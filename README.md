# Mezőberény App

Statikus, szerver nélküli hírolvasó és városi információs webalkalmazás, amely
GitHub Pages-ről fut. A hírek **munkanapokon 8:00 és 18:00 között, óránként**
frissülnek a [mezobereny.hu](https://mezobereny.hu/s/hirek) oldalról egy
ütemezett GitHub Actions workflow segítségével; az Események, Intézmények,
Elérhetőségek és Egyéb rovatokat kézzel szerkeszted.

Nincs backend, nincs adatbázis és **nincs build lépés** — minden statikus fájl.

---

## Tartalom

- [Fájlszerkezet](#fájlszerkezet)
- [GitHub Pages bekapcsolása](#github-pages-bekapcsolása)
- [Sötét és világos téma](#sötét-és-világos-téma)
- [Tartalom szerkesztése — áttekintés](#tartalom-szerkesztése--áttekintés)
  - [Események](#események)
  - [Intézmények](#intézmények)
  - [Elérhetőségek](#elérhetőségek)
  - [Egyéb — linkek](#egyéb--linkek)
  - [Szövegformázás](#szövegformázás)
- [A hírek frissítése](#a-hírek-frissítése)
- [A scraper átállítása másik forrásra](#a-scraper-átállítása-másik-forrásra)
- [Helyi futtatás](#helyi-futtatás)

---

## Fájlszerkezet

```
├── index.html                    # az alkalmazás egyetlen HTML oldala (hash-alapú router)
├── assets/
│   ├── css/app.css               # teljes design rendszer, reszponzív töréspontokkal
│   └── js/app.js                 # router, nézetek, adatbetöltés
├── data/
│   ├── news.json                 # AUTOMATIKUS — a scraper írja, ne szerkeszd kézzel
│   ├── status.json               # AUTOMATIKUS — a legutóbbi frissítés sikeressége
│   └── info.json                 # KÉZZEL SZERKESZTETT — minden más rovat tartalma
├── scraper/
│   ├── scrape.py                 # a hírek begyűjtése
│   └── requirements.txt
├── .github/workflows/
│   └── update-news.yml           # munkaidőben óránkénti futtatás + commit
└── .nojekyll                     # kikapcsolja a felesleges Jekyll feldolgozást
```

### Navigáció

| Rovat | Útvonal | Adatforrás |
|---|---|---|
| Hírek | `#/hirek` | `data/news.json` (automatikus) |
| Események | `#/esemenyek` | `info.json` → `section: "esemenyek"` |
| Intézmények | `#/intezmenyek` | `info.json` → `section: "intezmenyek"` |
| Elérhetőségek | `#/elerhetosegek` | `info.json` → `section: "elerhetosegek"` |
| Egyéb | `#/egyeb` | `info.json` → `links` blokk |

További nézetek: `#/felfedezes` (keresés és kategóriaszűrés a hírek között),
`#/hir/<id>` (hír részletei), `#/info/<id>` (bejegyzés részletei).

---

## GitHub Pages bekapcsolása

1. A repóban nyisd meg: **Settings → Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main`, mappa: **`/ (root)`** — majd **Save**
4. Néhány perc múlva az oldal elérhető lesz:
   `https://galandras12.github.io/mezoberenyapp.github.io/`

---

## Sötét és világos téma

Az alkalmazás mindkét témát támogatja. A **bal felső sarokban** lévő kör alakú
gomb vált közöttük:

- **világos témában** fekete körben fehér fogyó hold (kattintásra sötét lesz)
- **sötét témában** fehér körben fekete napocska (kattintásra világos lesz)

A gomb helye: mobilon a fejléc bal szélén (részletnézetben a képre lebegve),
desktopon az oldalsáv tetején.

Amíg a látogató nem választ kézzel, az alkalmazás a **rendszer** beállítását
követi, és menet közbeni váltásra (pl. esti automatikus sötét mód) is reagál.
A kézi választást a böngésző elmenti, így legközelebb is megmarad.

A színek CSS változókban (tokenekben) vannak, a komponensek nem tartalmaznak
beégetett színt — ezért egy szín módosításához elég a `:root` blokkot és a
sötét téma blokkját szerkeszteni az `assets/css/app.css` fájl tetején.

---

## Tartalom szerkesztése — áttekintés

Minden kézi tartalom egyetlen fájlban van: **`data/info.json`**.

1. Nyisd meg a GitHubon a `data/info.json` fájlt
2. Kattints a ceruza ikonra (**Edit this file**)
3. Írd át a tartalmat, majd alul **Commit changes**
4. 1–2 perc múlva a változás élesben is látszik

> A repóban jelenleg **minta bejegyzések** vannak (`MINTA` jelöléssel és
> `(kitöltendő)` helyekkel). Ezeket írd át valós, ellenőrzött adatokra, a
> feleslegeseket pedig töröld.

**Fontos:** ha elrontod a JSON szintaxist, az érintett rovatok üresen jelennek
meg (a hírek tovább működnek). A bejegyzések között legyen **vessző**, az
utolsó után viszont **ne**. Mentés előtt érdemes egy JSON validátorral
ellenőrizni.

### Minden bejegyzés közös mezői

| Mező | Kötelező | Leírás |
|---|---|---|
| `id` | ✔ | Egyedi azonosító, ékezet és szóköz nélkül. Ez kerül az URL-be. |
| `section` | ✔ | Melyik rovatba tartozik: `esemenyek`, `intezmenyek`, `elerhetosegek` vagy `egyeb`. |
| `category` | ✔ | A rovaton belüli kategória — ebből lesznek a szűrő gombok. |
| `title` | ✔ | A bejegyzés címe. |
| `excerpt` | – | Rövid leírás a listanézethez. |
| `image_url` | – | Kép URL-je, vagy `null`. Ha `null`, kategóriaszínű helykitöltő jelenik meg a kezdőbetűvel. |
| `content` | – | A teljes szöveg (lásd [Szövegformázás](#szövegformázás)). |

---

### Események

Az eseményeket **nem kell sorba rendezned** — az alkalmazás automatikusan
rendezi őket az `event_date` alapján:

- a **közelgő** események elöl, időrendben (a legközelebbi legfelül),
  mindegyiken egy visszaszámláló: „Ma”, „Holnap”, „11 nap múlva”;
- a **lezajlott** események alul, egy külön, szürkített
  **„Véget ért események”** szekcióban, a legutóbbival kezdve.

| Extra mező | Leírás |
|---|---|
| `event_date` | Az esemény időpontja ISO formában: `"2026-09-20T17:00:00+02:00"`. Ha csak dátumot adsz meg (`"2026-09-20"`), az óra nem jelenik meg. |

```json
{
  "id": "szureti-felvonulas",
  "section": "esemenyek",
  "category": "Programok",
  "title": "Szüreti felvonulás",
  "excerpt": "Hagyományos szüreti menet a városközpontban.",
  "image_url": "https://mezobereny.hu/…/kep.jpg",
  "event_date": "2026-09-20T17:00:00+02:00",
  "content": "Az esemény részletes leírása.\n\n**Helyszín:** Kossuth tér"
}
```

Az időpontok mindig **budapesti idő szerint** jelennek meg, akkor is, ha a
látogató másik időzónában nyitja meg az oldalt.

---

### Intézmények

A rovat a kategóriák szerint **csoportosítva** jelenik meg, ebben a sorrendben:

`Városháza` · `Orlai ház` · `Óvoda` · `Oktatás` · `Iskola` · `Egészségügy` ·
`Humánsegítő`

Ha ezektől eltérő `category` értéket írsz be, az is működik — a lista végére
kerül. A bejegyzés részletes nézetének alján megjelenik a
**„Tovább az intézmény weboldalára”** gomb, ha megadtad a `website_url`-t.

| Extra mező | Leírás |
|---|---|
| `website_url` | Az intézmény weboldala. Üresen hagyva (`""`) a gomb nem jelenik meg. |
| `address` | Cím — a listában és a részletnézetben is látszik. |
| `phone` | Telefonszám — a részletnézetben kattintható (hívás indul). |
| `email` | E-mail cím — a részletnézetben kattintható. |

> **Hol látszanak ezek?** A listában helytakarékosságból csak a cím (vagy ha az
> nincs, a telefonszám) jelenik meg. A teljes kapcsolati blokk — cím, telefon,
> e-mail — és a weboldal gomb a **bejegyzésre koppintva**, a részletes nézetben
> érhető el.

---

### Elérhetőségek

Ugyanaz a felépítés, mint az Intézményeknél, ezekkel a kategóriákkal:

`Önkormányzat` · `Városháza` · `Óvodák` · `Orlai ház` ·
`Humánsegítő/Városüzemeltetés`

Ugyanazok az extra mezők használhatók (`website_url`, `address`, `phone`,
`email`).

---

### Egyéb — linkek

Az Egyéb fül tartalma a `info.json` elején lévő **`links`** blokkból jön:

```json
"links": {
  "facebook_url": "",
  "website_url": "https://mezobereny.hu",
  "developer_name": "Gál András",
  "developer_url": "https://github.com/galandras12",
  "developer_email": "admin@galandras.com"
}
```

| Mező | Hova kerül |
|---|---|
| `facebook_url` | „A Város Facebook oldala” — **ide írd be a teljes Facebook URL-t.** Amíg üres, a sor „Hamarosan” jelöléssel, nem kattinthatóan jelenik meg. |
| `website_url` | „A város hivatalos honlapja” |
| `developer_name` | A fejlesztő neve |
| `developer_url` | A név melletti zöld nyíl célja |
| `developer_email` | A boríték ikon célja (`mailto:`) |

Ha ide is szeretnél szöveges bejegyzéseket, vegyél fel `"section": "egyeb"`
elemeket az `items` tömbbe — ezek a linkek alatt jelennek meg.

---

### Szövegformázás

A `content` mezőben a bekezdéseket **üres sor** választja el (JSON-ben `\n\n`):

| Amit írsz | Amit kapsz |
|---|---|
| `**vastag**` | **vastag** |
| `*dőlt*` | *dőlt* |
| `## Alcím` / `### Alcím` | alcímek |
| `- elem` (soronként) | felsorolás |
| `> Figyelem!` | kiemelt, kék hátterű megjegyzés |
| `[szöveg](https://pelda.hu)` | link (új lapon nyílik) |
| `[hívás](tel:+3612345678)` | telefon link |
| `[e-mail](mailto:cim@pelda.hu)` | e-mail link |

Példa (a JSON-ben a sortörés `\n`):

```json
"content": "## Ügyfélfogadás\n\n- Hétfő: 8:00–16:00\n- Kedd: **zárva**\n\n> Ünnepnapokon szünetel.\n\nRészletek a [honlapon](https://mezobereny.hu)."
```

---

## A hírek frissítése

A `.github/workflows/update-news.yml` workflow:

- **munkanapokon (hétfő–péntek) 8:00 és 18:00 között, óránként** fut le —
  hétvégén és éjszaka nem, mert olyankor jellemzően nem kerül fel új hír;
- kézzel bármikor indítható: **Actions → Hírek frissítése → Run workflow**
  (kézi indításnál az időablak-korlátozás nem érvényes);
- **csak akkor** commitol, ha a `data/` mappa ténylegesen változott;
- a commit üzenete `[skip ci]`-t tartalmaz, így nem indít újabb futást.

### Miért nem elég a cron?

A GitHub Actions cron kifejezései **UTC** szerint futnak, és nem ismerik a
nyári időszámítást. Ezért a workflow tágabb ablakban indul
(`0 6-17 * * 1-5`), majd az első lépés `Europe/Budapest` szerint ellenőrzi az
időt, és munkaidőn kívül azonnal kilép. Így nyáron és télen egyaránt pontosan
8:00–18:00 között fut, és a felesleges futások nem terhelik a forrásoldalt.

A push a beépített `GITHUB_TOKEN`-nel történik — **külön secretet nem kell
beállítani**. Ehhez a repó **Settings → Actions → General → Workflow
permissions** pontjánál a *Read and write permissions* legyen bekapcsolva.

### Mit gyűjt be a scraper

A `/s/hirek` listaoldal `div.cikk_box` elemeiből: cím, cikk URL, kategória,
szerző, kibocsátó, a pontos „Létrehozva” időbélyeg és egy rövid kivonat.
Alapértelmezetten 3 listaoldalt (54 hír) olvas be, és legfeljebb 200 hírt tart
meg a JSON-ben.

**Képek.** A forrásoldal `og:image` meta tagje minden cikknél ugyanaz a városi
logó, ezért használhatatlan. A scraper helyette három forrásból próbálkozik,
ebben a sorrendben, és a talált kép URL-je automatikusan bekerül a hírbe:

1. a listaoldalon található kép (`data-src`, lazy-load) — ehhez nem kell külön kérés,
2. a cikkhez tartozó **fotógaléria** első képe (`/s/galeria/...`),
3. a cikktörzsbe ágyazott kép.

Egy hírnél ez a keresés **csak egyszer** fut le: az eredményt az `image_checked`
mező jelöli, és a megtalált kép a következő futásokban öröklődik. Így az órás
futás nem terheli feleslegesen a forrásoldalt.

Amelyik hírhez nincs kép, ott az alkalmazás kategóriaszínű, a kategória
kezdőbetűjét mutató helykitöltőt jelenít meg — a layout nem törik el.

A `last_updated` mező (az alkalmazásban „Utolsó frissítés”) a **tartalom**
utolsó tényleges változásának idejét jelöli, nem az utolsó ellenőrzését. Ha egy
futás nem talál új vagy módosult hírt, a `news.json` érintetlen marad.

### Hibatűrés és a tájékoztató sáv

- Ha a forrásoldal nem érhető el, a scraper 3× újrapróbálja (2s, 4s, 8s várakozással).
- Ha egyetlen hírt sem sikerül feldolgozni (pl. megváltozott a HTML szerkezet),
  a szkript **hibával leáll, és nem írja felül** a meglévő `news.json`-t —
  így hibás vagy üres adat nem kerül élesbe.
- Hiba esetén a scraper a **`data/status.json`** fájlba `"ok": false` értéket ír.
  Ilyenkor az alkalmazás a Hírek és a Felfedezés nézet tetején tájékoztató
  sávot jelenít meg:

  > Probléma adódott az utolsó hírek lekérése során. Elképzelhető, hogy a
  > weboldalon karbantartás folyik. Hamarosan frissítjük a hírfolyamot.

  A korábban letöltött hírek közben **továbbra is olvashatók** maradnak. Amint
  egy futás újra sikerül, a sáv magától eltűnik.
- A `status.json` `message` mezője a technikai hibaokot tartalmazza
  (hibakereséshez); a felhasználó ezt nem látja.

### Beállítható környezeti változók

| Változó | Alap | Jelentés |
|---|---|---|
| `MB_LIST_PAGES` | `3` | Hány listaoldalt olvasson be (18 hír / oldal). |
| `MB_MAX_ARTICLES` | `200` | Legfeljebb ennyi hír maradjon a JSON-ben. |
| `MB_MAX_IMAGE_LOOKUPS` | `12` | Futásonként legfeljebb ennyi hírnél keressen képet. |

---

## A scraper átállítása másik forrásra

A cél URL a `scraper/scrape.py` tetején van:

```python
BASE_URL = "https://mezobereny.hu"
LIST_URL = f"{BASE_URL}/s/hirek"
```

Ha másik oldalt szeretnél feldolgozni, a fentieken túl a `parse_list_page()`
függvény CSS-szelektorait is át kell írni — jelenleg a `div.cikk_box`,
`h3 a` és `ul.params li` elemekre épül. A lapozás mintája a `main()`
függvényben van (`/s/hirek/18`, `/36`, … 18-as lépésköz).

---

## Helyi futtatás

Az oldal `fetch()`-csel tölti be a JSON fájlokat, ezért **nem elég** duplán
kattintani az `index.html`-en (a `file://` protokollt a böngésző blokkolja).
Indíts egy egyszerű helyi szervert:

```bash
python3 -m http.server 8000
```

Ezután nyisd meg: <http://localhost:8000>

A scraper helyi futtatása:

```bash
pip install -r scraper/requirements.txt
python3 scraper/scrape.py
```

---

## Licenc

Lásd a [LICENSE](LICENSE) fájlt. A hírek tartalmának jogtulajdonosa
Mezőberény Város Önkormányzata; ez az alkalmazás a nyilvánosan elérhető
városi híreket jeleníti meg, a forrás megjelölésével.
