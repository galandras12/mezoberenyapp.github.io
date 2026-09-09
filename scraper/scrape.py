#!/usr/bin/env python3
"""
Mezőberény hírek scraper.

Beolvassa a https://mezobereny.hu/s/hirek oldal híreit és a data/news.json
fájlba írja őket. Csak az új (még nem ismert azonosítójú) hírekhez nyit meg
külön kérést a részletoldalra, hogy képet keressen — a már ismert hírek
képei a meglévő JSON-ből öröklődnek.

Hibatűrés: ha a forrás elérhetetlen vagy a HTML struktúra megváltozott,
a szkript nem írja felül a meglévő news.json-t, hanem nem nulla
kilépési kóddal leáll, hogy a workflow láthatóan elbukjon.
"""

from __future__ import annotations

import copy
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://mezobereny.hu"
LIST_URL = f"{BASE_URL}/s/hirek"

# Hány listaoldalt olvassunk be (18 hír / oldal).
LIST_PAGES = int(os.environ.get("MB_LIST_PAGES", "3"))
# Legfeljebb ennyi hírt tartunk meg a JSON-ben.
MAX_ARTICLES = int(os.environ.get("MB_MAX_ARTICLES", "200"))
# Futásonként legfeljebb ennyi új hírnél keresünk képet (a futásidő korlátozására).
MAX_IMAGE_LOOKUPS = int(os.environ.get("MB_MAX_IMAGE_LOOKUPS", "12"))

OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json"
)

TZ = ZoneInfo("Europe/Budapest")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MezoberenyAppBot/1.0; "
        "+https://github.com/galandras12/mezoberenyapp.github.io)"
    ),
    "Accept-Language": "hu-HU,hu;q=0.9",
}

# A részletoldal sablonjához tartozó képek, ezek soha nem a cikk képei.
CHROME_IMAGE_PATTERNS = (
    "/assets/images/",
    "siklosi_istvan_polgarmester",
    "VJP_kozlemeny",
    "ohp_banner",
    "efop_",
    "EFOP-",
)

EXCERPT_MAX_CHARS = 260


class ScrapeError(RuntimeError):
    """A scraping folyamat helyreállíthatatlan hibája."""


def fetch(url: str, *, retries: int = 3, timeout: int = 30) -> str:
    """Letölt egy oldalt, exponenciálisan növekvő várakozással újrapróbálva."""
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=timeout)
            response.raise_for_status()
            response.encoding = response.apparent_encoding or "utf-8"
            return response.text
        except Exception as error:  # noqa: BLE001 - hálózati hibák széles köre
            last_error = error
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                log(f"  ! {url} sikertelen ({error}), újrapróbálás {wait}s múlva")
                time.sleep(wait)
    raise ScrapeError(f"Nem sikerült letölteni: {url} ({last_error})")


def log(message: str) -> None:
    print(message, flush=True)


def absolutize(url: str) -> str:
    if url.startswith("http"):
        return url
    return f"{BASE_URL}/{url.lstrip('/')}"


def parse_created_at(raw: str) -> str | None:
    """'2026-09-07 08:38' -> ISO 8601 időbélyeg budapesti időzónával."""
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})", raw)
    if not match:
        return None
    year, month, day, hour, minute = (int(part) for part in match.groups())
    try:
        return datetime(year, month, day, hour, minute, tzinfo=TZ).isoformat()
    except ValueError:
        return None


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def shorten(text: str, limit: int = EXCERPT_MAX_CHARS) -> str:
    """Szóhatáron rövidít, hogy a kivonat ne vágjon szót ketté."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rstrip()
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"


def parse_params(box) -> dict[str, str]:
    """A 'Létrehozva / Szerző / Kategória / Kibocsátó' lista feldolgozása."""
    params: dict[str, str] = {}
    param_list = box.select_one("ul.params")
    if not param_list:
        return params
    for item in param_list.select("li"):
        text = clean_text(item.get_text(" ", strip=True))
        if ":" not in text:
            continue
        label, _, value = text.partition(":")
        params[label.strip().lower()] = value.strip()
    return params


def parse_excerpt(box) -> str:
    """A cikk-doboz szövegéből épít rövid kivonatot."""
    parts: list[str] = []
    for paragraph in box.find_all("p", recursive=False):
        if "clear" in (paragraph.get("class") or []):
            continue
        text = clean_text(paragraph.get_text(" ", strip=True))
        if text:
            parts.append(text)
        if sum(len(part) for part in parts) > EXCERPT_MAX_CHARS:
            break

    if not parts:
        # Néhány hírnél a szöveg táblázatban vagy div-ben áll, nem közvetlen
        # <p> gyerekelemben — ilyenkor a doboz teljes szövegéből dolgozunk,
        # a címet, a paraméterlistát és a "Bővebben" linket kihagyva.
        clone = copy.copy(box)
        for unwanted in clone.select("h3, ul.params, .a_hir_tovabb"):
            unwanted.decompose()
        parts.append(clean_text(clone.get_text(" ", strip=True)))

    return shorten(clean_text(" ".join(parts)))


def parse_list_image(box) -> str | None:
    """A listaoldalon néhány hírnél már ott a kép (lazyload: data-src)."""
    for image in box.select("img"):
        src = image.get("data-src") or image.get("src")
        if not src:
            continue
        if any(pattern in src for pattern in CHROME_IMAGE_PATTERNS):
            continue
        if re.search(r"\.(jpg|jpeg|png|gif|webp)(\?|$)", src, re.IGNORECASE):
            return absolutize(src.strip())
    return None


def parse_list_page(html: str) -> list[dict]:
    """Egy listaoldal összes hírének kinyerése."""
    soup = BeautifulSoup(html, "html.parser")
    articles: list[dict] = []

    for box in soup.select("div.cikk_box"):
        link = box.select_one("h3 a[href]")
        if not link:
            continue
        url = link["href"].strip()
        id_match = re.search(r"/s/hir/(\d+)/", url)
        if not id_match:
            continue
        title = clean_text(link.get_text(" ", strip=True))
        if not title:
            continue

        params = parse_params(box)
        list_image = parse_list_image(box)
        articles.append(
            {
                "id": id_match.group(1),
                "title": title,
                "url": url if url.startswith("http") else f"{BASE_URL}{url}",
                "category": params.get("kategória") or "Általános",
                "author": params.get("szerző") or "",
                "source_name": params.get("kibocsátó") or "Önkormányzat",
                "published_at": parse_created_at(params.get("létrehozva", "")),
                "excerpt": parse_excerpt(box),
                "image_url": list_image,
                "thumb_url": list_image,
                "image_checked": False,
            }
        )

    return articles


def extract_article_body(html: str) -> str:
    """A részletoldal cikktörzsének kivágása a sablon-elemek közül."""
    start = html.find('class="hir_szerv2"')
    if start < 0:
        start = html.find('id="hir_inner"')
    if start < 0:
        return ""
    end = len(html)
    for marker in ('class="cimkek"', 'class="socialmedia"'):
        position = html.find(marker, start)
        if position > 0:
            end = min(end, position)
    return html[start:end]


def find_gallery_images(body: str) -> tuple[str | None, str | None]:
    """Galéria link esetén visszaadja az első kép (orig, thumb) URL-jét."""
    match = re.search(r'href="([^"]*?/s/galeria/[^"]+)"', body)
    if not match:
        return None, None
    gallery_url = absolutize(match.group(1))
    try:
        gallery_html = fetch(gallery_url, retries=2, timeout=25)
    except ScrapeError as error:
        log(f"  ! galéria nem elérhető: {error}")
        return None, None

    thumb_match = re.search(
        r'src="([^"]*/galeriak/[^"]+/thumb/[^"]+\.(?:jpg|jpeg|png))"',
        gallery_html,
        re.IGNORECASE,
    )
    if not thumb_match:
        return None, None
    thumb = absolutize(thumb_match.group(1))
    return thumb.replace("/thumb/", "/orig/"), thumb


def find_body_image(body: str) -> str | None:
    """Cikktörzsbe ágyazott kép keresése, a sablon-képeket kihagyva."""
    for src in re.findall(r'<img[^>]+src="([^"]+)"', body, re.IGNORECASE):
        if any(pattern in src for pattern in CHROME_IMAGE_PATTERNS):
            continue
        if re.search(r"\.(jpg|jpeg|png|webp)(\?|$)", src, re.IGNORECASE):
            return absolutize(src)
    return None


def lookup_image(article: dict) -> tuple[str | None, str | None]:
    """Kép keresése egy hírhez: előbb galéria, utána cikktörzs."""
    try:
        html = fetch(article["url"], retries=2, timeout=25)
    except ScrapeError as error:
        log(f"  ! részletoldal nem elérhető: {error}")
        return None, None

    body = extract_article_body(html)
    if not body:
        return None, None

    image, thumb = find_gallery_images(body)
    if image:
        return image, thumb

    body_image = find_body_image(body)
    return body_image, body_image


def load_existing() -> dict:
    if not os.path.exists(OUTPUT_PATH):
        return {"articles": []}
    try:
        with open(OUTPUT_PATH, encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and isinstance(data.get("articles"), list):
            return data
    except (OSError, json.JSONDecodeError) as error:
        log(f"! A meglévő news.json nem olvasható ({error}), üresként kezeljük")
    return {"articles": []}


def sort_key(article: dict) -> str:
    return article.get("published_at") or ""


def main() -> int:
    log(f"Hírek beolvasása innen: {LIST_URL} ({LIST_PAGES} oldal)")

    scraped: list[dict] = []
    for page in range(LIST_PAGES):
        url = LIST_URL if page == 0 else f"{LIST_URL}/{page * 18}"
        try:
            page_articles = parse_list_page(fetch(url))
        except ScrapeError as error:
            if page == 0:
                log(f"HIBA: {error}")
                return 1
            log(f"! A(z) {page + 1}. oldal kihagyva: {error}")
            continue

        log(f"  {url}: {len(page_articles)} hír")
        if not page_articles:
            break
        scraped.extend(page_articles)

    if not scraped:
        log(
            "HIBA: egyetlen hírt sem sikerült feldolgozni — valószínűleg "
            "megváltozott a forrásoldal HTML szerkezete. A meglévő news.json "
            "változatlan marad."
        )
        return 1

    existing = load_existing()
    known = {article["id"]: article for article in existing["articles"] if "id" in article}

    merged: dict[str, dict] = {}
    for article in scraped:
        previous = known.get(article["id"])
        if previous:
            # A korábban megtalált képet megtartjuk, nem kérjük le újra;
            # ha korábban nem volt kép, a listaoldali kép még beugorhat.
            article["image_url"] = previous.get("image_url") or article["image_url"]
            article["thumb_url"] = previous.get("thumb_url") or article["thumb_url"]
            article["image_checked"] = bool(previous.get("image_checked"))
        merged[article["id"]] = article

    # Részletoldalt csak azoknál nyitunk meg, ahol nincs kép és még soha nem
    # néztük meg — így egy hírre legfeljebb egyszer megy el külön kérés.
    pending_image_ids = [
        article_id
        for article_id, article in merged.items()
        if not article["image_url"] and not article.get("image_checked")
    ]

    log(
        f"{len(merged)} hír a listaoldalakról, "
        f"{len(pending_image_ids)} vár képkeresésre"
    )

    for article_id in pending_image_ids[:MAX_IMAGE_LOOKUPS]:
        article = merged[article_id]
        log(f"  kép keresése: {article['title'][:60]}")
        image, thumb = lookup_image(article)
        article["image_url"] = image
        article["thumb_url"] = thumb or image
        article["image_checked"] = True
        if image:
            log(f"    -> {image}")

    # A korábbi futások hírei megmaradnak archívumként.
    for article_id, article in known.items():
        merged.setdefault(article_id, article)

    articles = sorted(merged.values(), key=sort_key, reverse=True)[:MAX_ARTICLES]
    with_images = sum(1 for article in articles if article.get("image_url"))

    # A `last_updated` csak akkor változik, ha a tartalom is változott.
    # Enélkül minden órás futás új időbélyeget írna, és a workflow naponta
    # 24 fölösleges commitot hozna létre.
    if articles == existing.get("articles"):
        log(f"Nincs változás ({len(articles)} hír) — a news.json érintetlen marad")
        return 0

    log(f"Összesen {len(articles)} hír mentése ({with_images} képpel)")

    payload = {
        "last_updated": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "source_url": LIST_URL,
        "articles": articles,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    log(f"Kész: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ScrapeError as error:
        log(f"HIBA: {error}")
        sys.exit(1)
