# Mezőberény App

Statikus, szerver nélküli hírolvasó és városi információs webalkalmazás, amely
GitHub Pages-ről fut. A hírek óránként frissülnek a
[mezobereny.hu](https://mezobereny.hu/s/hirek) oldalról egy ütemezett GitHub
Actions workflow segítségével; az információs rovatokat kézzel szerkeszted.

Nincs backend, nincs adatbázis és **nincs build lépés** — minden statikus fájl.

---

## Tartalom

- [Fájlszerkezet](#fájlszerkezet)
- [GitHub Pages bekapcsolása](#github-pages-bekapcsolása)
- [Az infó tartalmak szerkesztése](#az-infó-tartalmak-szerkesztése)
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
│   └── info.json                 # KÉZZEL SZERKESZTETT — az infó rovatok tartalma
├── scraper/
│   ├── scrape.py                 # a hírek begyűjtése
│   └── requirements.txt
├── .github/workflows/
│   └── update-news.yml           # óránkénti futtatás + commit
└── .nojekyll                     # kikapcsolja a felesleges Jekyll feldolgozást
```

### Navigáció

Az alkalmazás öt fő rovatból áll (alul mobilon, oldalt desktopon):

| Rovat | Útvonal | Adatforrás |
|---|---|---|
| Hírek | `#/hirek` | `data/news.json` (automatikus) |
| Események | `#/esemenyek` | `data/info.json` → `section: "esemenyek"` |
| Intézmények | `#/intezmenyek` | `data/info.json` → `section: "intezmenyek"` |
| Elérhetőségek | `#/elerhetosegek` | `data/info.json` → `section: "elerhetosegek"` |
| Egyéb | `#/egyeb` | `data/info.json` → `section: "egyeb"` |

További nézetek: `#/felfedezes` (keresés és kategóriaszűrés a hírek között),
`#/hir/<id>` (hír részletei), `#/info/<id>` (infó bejegyzés részletei).

---

## GitHub Pages bekapcsolása

1. A repóban nyisd meg: **Settings → Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main`, mappa: **`/ (root)`** — majd **Save**
4. Néhány perc múlva az oldal elérhető lesz:
   `https://galandras12.github.io/mezoberenyapp.github.io/`

> Az alkalmazás a repó gyökeréből fut (nem a `/docs` mappából), mert az
> `index.html` és a `data/` mappa is ott van. Ha `/docs`-ba szeretnéd tenni,
> mozgasd át az `index.html`, `assets/`, `data/` és `.nojekyll` elemeket, és a
> `scraper/scrape.py` `OUTPUT_PATH` változóját is igazítsd hozzá.

---

## Az infó tartalmak szerkesztése

Ezek a tartalmak **nem** a scraperből jönnek — te töltöd fel őket.

### Hogyan szerkeszd

1. Nyisd meg a GitHubon a **`data/info.json`** fájlt
2. Kattints a ceruza ikonra (**Edit this file**)
3. Írd át a tartalmat, majd alul **Commit changes**
4. 1–2 perc múlva a változás élesben is látszik

Build lépés nincs, az oldal a fájlt közvetlenül olvassa.

### Egy bejegyzés felépítése

```json
{
  "id": "varoshaza-nyitvatartas",
  "section": "elerhetosegek",
  "category": "Ügyfélfogadás",
  "title": "Városháza ügyfélfogadási rend",
  "excerpt": "Rövid összefoglaló, ez látszik a listában.",
  "image_url": null,
  "pinned": true,
  "updated_at": "2026-09-09T00:00:00Z",
  "content": "A teljes szöveg, akár több bekezdéssel."
}
```

| Mező | Kötelező | Leírás |
|---|---|---|
| `id` | ✔ | Egyedi azonosító, ékezet és szóköz nélkül. Ez kerül az URL-be. |
| `section` | ✔ | Melyik rovatban jelenjen meg: `esemenyek`, `intezmenyek`, `elerhetosegek` vagy `egyeb`. |
| `category` | ✔ | Szabadon választható. A rovaton belül ezekből lesznek a szűrő gombok. |
| `title` | ✔ | A bejegyzés címe. |
| `excerpt` | – | Rövid leírás a listanézethez. |
| `image_url` | – | Kép URL-je, vagy `null`. Ha `null`, kategóriaszínű helykitöltő jelenik meg a kategória kezdőbetűjével. |
| `pinned` | – | `true` esetén a rovat tetején, a „Kiemelt” szekcióban jelenik meg. |
| `updated_at` | – | ISO dátum. A nézetben „Frissítve: ÉÉÉÉ. HH. NN.” formában látszik. |
| `content` | – | A teljes szöveg (lásd a formázást lentebb). |

### Szövegformázás a `content` mezőben

A bekezdéseket **üres sor** választja el (JSON-ben ez `\n\n`):

| Amit írsz | Amit kapsz |
|---|---|
| `**vastag**` | **vastag** |
| `*dőlt*` | *dőlt* |
| `## Alcím` | alcím (nagyobb) |
| `### Alcím` | alcím (kisebb) |
| `- elem` (soronként) | felsorolás |
| `[szöveg](https://pelda.hu)` | link (új lapon nyílik) |
| `[hívás](tel:+3612345678)` | telefon link |
| `[e-mail](mailto:cim@pelda.hu)` | e-mail link |
| `> Figyelem!` | kiemelt, kék hátterű megjegyzés |

Példa egy soron belül (a JSON-ben a sortörés `\n`):

```json
"content": "## Ügyfélfogadás\n\n- Hétfő: 8:00–16:00\n- Kedd: **zárva**\n\n> Ünnepnapokon az ügyfélfogadás szünetel.\n\nRészletek a [honlapon](https://mezobereny.hu)."
```

### Új bejegyzés hozzáadása

Másold le egy meglévő bejegyzést a `items` tömbön belül, add neki új `id`-t, és
írd át a mezőit. Ügyelj rá, hogy a bejegyzések között **vessző** legyen, az
utolsó után viszont **ne**.

> A repóban jelenleg **minta bejegyzések** vannak (`MINTA BEJEGYZÉS` jelöléssel
> és `(kitöltendő)` helyekkel). Ezeket írd át valós, ellenőrzött adatokra, a
> feleslegeseket pedig töröld.

Ha elrontod a JSON szintaxist, az infó rovatok üresen jelennek meg (a hírek
tovább működnek). Ilyenkor ellenőrizd a fájlt egy JSON validátorral.

---

## A hírek frissítése

A `.github/workflows/update-news.yml` workflow:

- **minden óra 0. percében** lefut (`cron: '0 * * * *'`, UTC szerint),
- kézzel is indítható: **Actions → Hírek frissítése → Run workflow**,
- lefuttatja a scrapert, és **csak akkor** commitol, ha a `data/news.json`
  ténylegesen változott,
- a commit üzenete `[skip ci]`-t tartalmaz, így nem indít újabb futást.

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
ebben a sorrendben:

1. a listaoldalon található kép (`data-src`, lazy-load) — ehhez nem kell külön kérés,
2. a cikkhez tartozó **fotógaléria** első képe (`/s/galeria/...`),
3. a cikktörzsbe ágyazott kép.

Egy hírnél ez a keresés **csak egyszer** fut le: az eredményt az `image_checked`
mező jelöli, és a megtalált kép a következő futásokban öröklődik. Így az
óránkénti futás nem terheli feleslegesen a forrásoldalt.

Amelyik hírhez nincs kép, ott az alkalmazás kategóriaszínű, a kategória
kezdőbetűjét mutató helykitöltőt jelenít meg — a layout nem törik el.

A `last_updated` mező (amit az alkalmazás „Utolsó frissítés” néven mutat) a
**tartalom** utolsó tényleges változásának idejét jelöli, nem az utolsó
ellenőrzését. Ha egy órás futás nem talál új vagy módosult hírt, a
`news.json` érintetlen marad, és nem születik commit sem.

### Hibatűrés

- Ha a forrásoldal nem érhető el, a scraper 3× újrapróbálja (2s, 4s, 8s várakozással).
- Ha egyetlen hírt sem sikerül feldolgozni (pl. megváltozott a HTML szerkezet),
  a szkript **hibával leáll, és nem írja felül** a meglévő `news.json`-t —
  így hibás vagy üres adat nem kerül élesbe. A workflow ilyenkor pirosra vált,
  és az Actions fülön látszik a hiba oka.
- A már meglévő hírek akkor is megmaradnak, ha egy futás kevesebb hírt talál.

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
