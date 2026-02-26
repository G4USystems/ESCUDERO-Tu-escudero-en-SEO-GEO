"""Background task for influencer discovery via Google SERP."""

import asyncio
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import delete as sa_delete, select

from app.celery_app import celery
import app.database as _db
from app.models.influencer import InfluencerResult
from app.models.job import BackgroundJob
from app.models.project import Brand
from app.models.seo import SerpQuery


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _celery_task(**kwargs):
    if celery is not None:
        return celery.task(**kwargs)
    return lambda fn: fn


@_celery_task(bind=True, name="influencers.run_search")
def run_influencer_search(self, job_id: str, project_id: str, niche_id: str | None, niche_slug: str | None, platforms: list[str], num_results: int):
    return _run_async(_run_influencer_search(job_id, project_id, niche_id, niche_slug, platforms, num_results))


async def _run_influencer_search(
    job_id: str,
    project_id: str,
    niche_id: str | None,
    niche_slug: str | None,
    platforms: list[str],
    num_results: int,
) -> dict:
    async with _db.async_session() as session:
        await _update_job(session, job_id, status="running")

        pid = uuid.UUID(project_id)

        # ── Load client brand for company_type context ──────────────────────
        brand_result = await session.execute(
            select(Brand).where(Brand.project_id == pid, Brand.is_client.is_(True))
        )
        client_brand = brand_result.scalar_one_or_none()
        company_type = client_brand.company_type if client_brand else None
        brand_name = client_brand.name if client_brand else None

        # ── Build search keywords ────────────────────────────────────────────
        niche_keywords = (niche_slug or "").replace("-", " ") if niche_slug else ""

        # For YouTube/Instagram, use SHORT topic terms (2-3 meaningful words).
        # Long niche slugs like "inversor-profesional-o-de-alto-poder-adquisitivo"
        # produce queries that are too specific for channel discovery.
        _STOP = {
            "o", "de", "del", "la", "el", "los", "las", "un", "una", "y", "e",
            "para", "con", "en", "por", "que", "a", "al", "se", "su", "lo",
            "muy", "mas", "más", "sin", "si", "no", "ni",
        }
        # Generic descriptor words that appear in company_type but don't represent
        # the sector (e.g. "Plataforma de financiación" → "financiación", not "Plataforma")
        _GENERIC_DESC = {
            "plataforma", "servicio", "servicios", "empresa", "empresas",
            "aplicacion", "aplicación", "app", "web", "portal", "herramienta",
            "sistema", "online", "digital", "tecnologia", "tecnología",
            "solucion", "solución", "agencia", "startup", "fintech",
            "compañia", "compañía", "grupo", "red", "comunidad",
        }

        def _meaningful_words(text: str, n: int) -> list[str]:
            """Extract the first n meaningful (non-stop, non-generic) words."""
            words = [
                w for w in text.split()
                if w.lower() not in _STOP
                and w.lower() not in _GENERIC_DESC
                and len(w) > 2
            ]
            return words[:n]

        # Build queries: combine best words from company_type + niche slug.
        # Target: 3 distinct queries ordered from most specific to broadest.
        ct_words = _meaningful_words(company_type or "", 2)
        niche_words = _meaningful_words(niche_keywords or "", 2)

        youtube_queries: list[str] = []

        # Q1: "youtuber [niche_word] España" — explicitly targets content creators
        # about the audience/topic rather than brand channels of the sector.
        if niche_words:
            youtube_queries.append(f"youtuber {niche_words[0]} España")

        # Q2: sector phrase from company_type for additional coverage
        if len(ct_words) >= 2:
            q2 = f"{ct_words[0]} {ct_words[1]} España"
            if q2 not in youtube_queries:
                youtube_queries.append(q2)
        elif len(ct_words) == 1:
            q2 = f"youtuber {ct_words[0]} España"
            if q2 not in youtube_queries:
                youtube_queries.append(q2)

        # Q3: podcast [sector_word] — catches audio/podcast-format creators
        # Use first ct_word (most topically relevant after generic filtering).
        if ct_words:
            q3 = f"podcast {ct_words[0]} España"
            if q3 not in youtube_queries:
                youtube_queries.append(q3)

        if not youtube_queries:
            # Fallback: use existing SEO keywords
            kw_result = await session.execute(
                select(SerpQuery.keyword)
                .where(SerpQuery.project_id == pid)
                .limit(3)
            )
            kws = [r[0] for r in kw_result.all()]
            fallback = " ".join(kws[:2]) if kws else "marketing"
            youtube_queries = [fallback + " España"]

        # First short query is the primary; remaining are secondary broadening queries
        base_query = youtube_queries[0]

        # ── Delete previous results for this project+niche (re-search) ──────
        delete_q = sa_delete(InfluencerResult).where(InfluencerResult.project_id == pid)
        if niche_slug:
            delete_q = delete_q.where(InfluencerResult.niche_slug == niche_slug)
        elif niche_id:
            delete_q = delete_q.where(InfluencerResult.niche_id == uuid.UUID(niche_id))
        await session.execute(delete_q)
        await session.flush()

        # ── Run SERP searches per platform ───────────────────────────────────
        from app.engines.seo import get_serp_provider
        from app.utils import rate_limiter

        total_platforms = len(platforms)
        found: list[InfluencerResult] = []

        try:
            provider = get_serp_provider()
        except ValueError:
            await _update_job(session, job_id, status="failed",
                              error="No SERP provider configured (set SERPER_API_KEY)")
            return {"error": "No SERP provider"}

        from app.config import settings

        for idx, platform in enumerate(platforms):
            await _update_job(
                session, job_id,
                progress=(idx / total_platforms) * 0.8,
                step_info={"platform": platform, "query": base_query},
            )

            # ── YouTube: Data API v3 → SearchAPI → SERP ──────────────────
            if platform == "youtube" and settings.youtube_api_key:
                channels: list[dict] = []
                existing_ids: set[str] = set()
                for yt_query in youtube_queries:
                    try:
                        batch = await _search_youtube_channels(
                            yt_query, max(num_results, 20), settings.youtube_api_key
                        )
                        for ch in batch:
                            if ch["channel_id"] not in existing_ids:
                                existing_ids.add(ch["channel_id"])
                                channels.append({**ch, "_query": yt_query})
                    except Exception as e:
                        print(f"[influencer] YouTube API failed for '{yt_query}': {e}")

                if channels:
                    for pos, ch in enumerate(channels[:num_results], start=1):
                        reason = _build_reason(
                            platform="youtube",
                            display_name=ch["title"],
                            snippet=ch["description"],
                            company_type=company_type,
                            niche_keywords=niche_keywords,
                        )
                        score = max(0.0, 100 - (pos - 1) * 8)
                        result = InfluencerResult(
                            project_id=pid,
                            niche_id=uuid.UUID(niche_id) if niche_id else None,
                            niche_slug=niche_slug,
                            job_id=uuid.UUID(job_id),
                            platform="youtube",
                            handle=ch.get("handle"),
                            display_name=ch["title"],
                            profile_url=ch["profile_url"],
                            source_url=ch["profile_url"],
                            subscribers=ch["subscribers"],
                            snippet=ch["description"][:500] if ch["description"] else None,
                            recommendation_reason=reason,
                            relevance_score=round(score, 1),
                            search_query=ch["_query"],
                        )
                        session.add(result)
                        found.append(result)
                    continue  # skip SERP for YouTube

            # ── YouTube: SearchAPI.io fallback (no YouTube API key) ──────
            if platform == "youtube" and settings.searchapi_key:
                channels = []
                existing_ids = set()
                for yt_query in youtube_queries:
                    try:
                        batch = await _search_youtube_channels_searchapi(
                            yt_query, max(num_results, 20), settings.searchapi_key
                        )
                        for ch in batch:
                            if ch["channel_id"] not in existing_ids:
                                existing_ids.add(ch["channel_id"])
                                channels.append({**ch, "_query": yt_query})
                    except Exception as e:
                        print(f"[influencer] SearchAPI YouTube failed for '{yt_query}': {e}")

                if channels:
                    for pos, ch in enumerate(channels[:num_results], start=1):
                        reason = _build_reason(
                            platform="youtube",
                            display_name=ch["title"],
                            snippet=ch["description"],
                            company_type=company_type,
                            niche_keywords=niche_keywords,
                        )
                        score = max(0.0, 100 - (pos - 1) * 8)
                        result = InfluencerResult(
                            project_id=pid,
                            niche_id=uuid.UUID(niche_id) if niche_id else None,
                            niche_slug=niche_slug,
                            job_id=uuid.UUID(job_id),
                            platform="youtube",
                            handle=ch.get("handle"),
                            display_name=ch["title"],
                            profile_url=ch["profile_url"],
                            source_url=ch["profile_url"],
                            subscribers=ch["subscribers"],
                            snippet=ch["description"][:500] if ch["description"] else None,
                            recommendation_reason=reason,
                            relevance_score=round(score, 1),
                            search_query=ch["_query"],
                        )
                        session.add(result)
                        found.append(result)
                    continue  # skip SERP for YouTube

            # ── Instagram: Google CSE discovery + Apify enrichment ──────────
            if platform == "instagram" and settings.google_cse_key and settings.google_cse_cx:
                cse_profiles: list[dict] = []
                for q in youtube_queries:
                    try:
                        batch = await _search_instagram_google_cse(
                            q, max(num_results, 20),
                            settings.google_cse_key, settings.google_cse_cx,
                        )
                        existing_urls = {p["profile_url"] for p in cse_profiles}
                        cse_profiles += [p for p in batch if p["profile_url"] not in existing_urls]
                    except Exception as e:
                        print(f"[influencer] Google CSE Instagram failed for '{q}': {e}")

                if cse_profiles:
                    ig_handles = [p["handle"] for p in cse_profiles if p.get("handle")]

                    # Try Apify first (if token set), fall back to free meta tag scraping
                    apify_data: dict[str, int] = {}
                    if settings.apify_token:
                        try:
                            apify_data = await _enrich_instagram_apify(ig_handles, settings.apify_token)
                        except Exception as e:
                            print(f"[influencer] Apify enrichment failed: {e}")
                    if not apify_data:
                        try:
                            apify_data = await _enrich_instagram_metatag(ig_handles)
                        except Exception as e:
                            print(f"[influencer] Meta tag enrichment failed: {e}")

                    for pos, p in enumerate(cse_profiles[:num_results], start=1):
                        handle = p.get("handle")
                        h_key = (handle or "").lstrip("@").lower()
                        followers = apify_data.get(h_key) if h_key else None
                        reason = _build_reason(
                            platform="instagram",
                            display_name=p["display_name"],
                            snippet=p.get("snippet"),
                            company_type=company_type,
                            niche_keywords=niche_keywords,
                        )
                        score = max(0.0, 100 - (pos - 1) * 8)
                        result = InfluencerResult(
                            project_id=pid,
                            niche_id=uuid.UUID(niche_id) if niche_id else None,
                            niche_slug=niche_slug,
                            job_id=uuid.UUID(job_id),
                            platform="instagram",
                            handle=handle,
                            display_name=p["display_name"],
                            profile_url=p["profile_url"],
                            source_url=p["profile_url"],
                            subscribers=followers or _extract_subscribers(p.get("snippet")),
                            snippet=p["snippet"][:500] if p.get("snippet") else None,
                            recommendation_reason=reason,
                            relevance_score=round(score, 1),
                            search_query=q,
                        )
                        session.add(result)
                        found.append(result)
                    continue  # skip SERP for Instagram

            # ── SERP fallback (YouTube without API key, or Instagram) ──────
            if platform == "youtube":
                # Run all candidate queries to maximise results
                serp_queries = []
                for q in youtube_queries:
                    serp_queries.append(f"site:youtube.com/@ {q}")
                    serp_queries.append(f"youtuber {q} canal")
            elif platform == "instagram":
                # Build Instagram-specific SERP queries.
                # Mix of: direct site: queries + "mejores influencers X instagram" articles
                serp_queries = []
                seen_q: set[str] = set()
                _ig_topics: list[str] = []
                if niche_words:
                    _ig_topics.append(niche_words[0])
                if ct_words:
                    _ig_topics.append(ct_words[0])
                if len(ct_words) >= 2 and f"{ct_words[0]} {ct_words[1]}" not in _ig_topics:
                    _ig_topics.append(f"{ct_words[0]} {ct_words[1]}")

                for topic in _ig_topics[:3]:
                    # 1. Direct site: search (profile pages)
                    q1 = f"site:instagram.com {topic} España"
                    if q1 not in seen_q:
                        seen_q.add(q1)
                        serp_queries.append(q1)
                    # 2. "mejores influencers X instagram" — article listings with IG URLs
                    q2 = f"mejores influencers {topic} España instagram"
                    if q2 not in seen_q:
                        seen_q.add(q2)
                        serp_queries.append(q2)

                # Generic finance profiles fallback
                q_fin = "site:instagram.com finanzas personales España"
                if q_fin not in seen_q:
                    serp_queries.append(q_fin)
            else:
                continue

            serp_items: list = []
            seen_profile_urls: set[str] = set()

            for serp_q in serp_queries:
                try:
                    await rate_limiter.acquire("serp")
                    resp = await provider.search(
                        serp_q,
                        location="Spain",
                        language="es",
                        num_results=10,  # Serper free tier caps at 10 per request
                    )
                    serp_items.extend(resp.items)
                except Exception as e:
                    print(f"[influencer] SERP search failed for '{serp_q}': {e}")

            # ── Collect profiles (deduplicated) before enrichment ────────
            serp_profiles: list[dict] = []  # for Instagram enrichment
            serp_profile_items: list[dict] = []  # full item data keyed by profile_url

            for position, item in enumerate(serp_items, start=1):
                if platform == "youtube" and "youtube.com" not in item.url:
                    continue

                handle, profile_url = _extract_profile(item.url, item.title, platform)
                if not profile_url:
                    continue
                norm_url = profile_url.rstrip("/").lower()
                if norm_url in seen_profile_urls:
                    continue
                seen_profile_urls.add(norm_url)

                clean_handle = handle.lstrip("@") if handle else None

                # For Instagram: fix display name (SERP titles are often article snippets)
                if platform == "instagram":
                    title_raw = item.title or ""
                    _is_profile_title = any(
                        m in title_raw.lower()
                        for m in [" • instagram", " | instagram", " - instagram", "(@"]
                    )
                    if _is_profile_title:
                        display_name = _clean_title(title_raw, "instagram") or clean_handle or ""
                    else:
                        raw_h = clean_handle or ""
                        display_name = re.sub(r"[._]", " ", raw_h).title() if raw_h else _clean_title(title_raw, "instagram")
                else:
                    display_name = _clean_title(item.title, platform)

                serp_profile_items.append({
                    "handle": clean_handle,
                    "display_name": display_name,
                    "profile_url": profile_url,
                    "source_url": item.url,
                    "snippet": item.snippet,
                    "position": position,
                    "search_query": serp_q,
                })
                if platform == "instagram" and clean_handle:
                    serp_profiles.append({"handle": clean_handle})

            # ── For Instagram SERP: enrich follower counts via meta tag ──
            serp_ig_followers: dict[str, int] = {}
            if platform == "instagram" and serp_profiles:
                ig_handles = [p["handle"] for p in serp_profiles]
                try:
                    serp_ig_followers = await _enrich_instagram_metatag(ig_handles)
                except Exception as e:
                    print(f"[influencer] Meta tag enrichment (SERP) failed: {e}")

            # ── Save SERP results ────────────────────────────────────────
            for entry in serp_profile_items[:max(num_results, 20)]:
                clean_handle = entry["handle"]
                h_key = (clean_handle or "").lower()
                if platform == "instagram":
                    subscribers = (
                        serp_ig_followers.get(h_key)
                        or _extract_subscribers(entry["snippet"])
                        or _extract_subscribers(entry["display_name"])
                    )
                else:
                    subscribers = _extract_subscribers(entry["snippet"]) or _extract_subscribers(entry["display_name"])

                reason = _build_reason(
                    platform=platform,
                    display_name=entry["display_name"],
                    snippet=entry["snippet"],
                    company_type=company_type,
                    niche_keywords=niche_keywords,
                )
                score = max(0.0, 100 - (entry["position"] - 1) * 8)

                result = InfluencerResult(
                    project_id=pid,
                    niche_id=uuid.UUID(niche_id) if niche_id else None,
                    niche_slug=niche_slug,
                    job_id=uuid.UUID(job_id),
                    platform=platform,
                    handle=clean_handle,
                    display_name=entry["display_name"],
                    profile_url=entry["profile_url"],
                    source_url=entry["source_url"],
                    subscribers=subscribers,
                    snippet=entry["snippet"][:500] if entry["snippet"] else None,
                    recommendation_reason=reason,
                    relevance_score=round(score, 1),
                    search_query=entry["search_query"],
                )
                session.add(result)
                found.append(result)

        await session.flush()
        await _update_job(
            session, job_id,
            status="completed",
            progress=1.0,
            result={"total": len(found), "platforms": platforms},
        )

    return {"total": len(found)}


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _search_youtube_channels(query: str, num_results: int, api_key: str) -> list[dict]:
    """Search YouTube channels via YouTube Data API v3.

    Returns list of dicts: {channel_id, title, description, profile_url, handle, subscribers}
    """
    import httpx

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "channel",
                "maxResults": 50,          # always fetch max to sort by audience
                "relevanceLanguage": "es",  # no regionCode — include all Spanish-language channels
                "key": api_key,
            },
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    if not items:
        return []

    # Batch fetch subscriber counts
    channel_ids = [
        item["id"]["channelId"]
        for item in items
        if item.get("id", {}).get("channelId")
    ]
    # Music topic IDs — channels with exclusively these topics are auto-generated artists
    MUSIC_TOPIC_IDS = {
        "/m/04rlf", "/m/02mscn", "/m/0ggq0m", "/m/01lyv", "/m/02lkt",
        "/m/0glt670", "/m/05rwpb", "/m/03_d0", "/m/028sqc", "/m/0g293",
        "/m/064t9", "/m/06j6l", "/m/06by7", "/m/0gywn",
    }

    stats: dict[str, dict] = {}
    if channel_ids:
        async with httpx.AsyncClient(timeout=15.0) as client:
            stats_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={
                    "part": "statistics,snippet,topicDetails",
                    "id": ",".join(channel_ids),
                    "key": api_key,
                },
            )
            if stats_resp.status_code == 200:
                for item in stats_resp.json().get("items", []):
                    cid = item["id"]
                    title = item.get("snippet", {}).get("title", "")
                    description = item.get("snippet", {}).get("description", "")
                    subs = item.get("statistics", {}).get("subscriberCount")
                    raw_handle = item.get("snippet", {}).get("customUrl") or ""
                    # customUrl comes as "@channelname" — store without leading @ so the
                    # frontend can render "@{handle}" without double-@
                    handle = raw_handle.lstrip("@") or None
                    topic_ids = set(item.get("topicDetails", {}).get("topicIds", []))

                    # Skip auto-generated music/topic channels
                    if title.endswith("- Topic"):
                        continue
                    if "Auto-generated by YouTube" in description:
                        continue
                    if topic_ids and topic_ids.issubset(MUSIC_TOPIC_IDS):
                        continue

                    # Skip corporate brand channels — detect by description content.
                    # Brand channels say "somos", "nuestros servicios", etc. while
                    # creator channels say "mi canal", "te enseño", "soy", etc.
                    desc_lc = description.lower()[:600]
                    _corp = [
                        "nuestros servicios", "nuestra plataforma", "nuestros clientes",
                        "te ayudamos", "somos una empresa", "somos un equipo",
                        "descubre nuestro", "conoce nuestros", "ofrecemos",
                        "nuestros productos", "nuestra app", "nuestra aplicación",
                        "our services", "our platform", "our clients",
                        # Financial brand patterns (e.g. MyInvestor)
                        "miles de clientes", "abre tu cuenta", "tu banca",
                        "tu cuenta corriente", "únete a los", "gestión automatizada",
                        "pon tu dinero a trabajar", "gestora de fondos",
                        "nuestras tarifas", "nuestra app de inversión",
                    ]
                    _creator = ["mi canal", "soy ", "en este canal", "te enseño", "comparto",
                                "mis videos", "mis análisis", "mi experiencia", "sígueme",
                                "me llamo", "suscríbete"]
                    corp_score = sum(1 for p in _corp if p in desc_lc)
                    creator_score = sum(1 for p in _creator if p in desc_lc)
                    # Also flag if the brand name appears in the first sentence of description
                    # (brand channels promote themselves: "Bienvenido a MyInvestor...")
                    title_first_word = title.lower().split()[0] if title else ""
                    if (len(title_first_word) > 4 and
                            title_first_word in desc_lc[:150] and
                            creator_score == 0):
                        corp_score += 2
                    if corp_score >= 2 and creator_score == 0:
                        continue

                    stats[cid] = {
                        "subscribers": int(subs) if subs else None,
                        "handle": handle,
                        "title": title,
                        "description": description,
                    }

    results = []
    for item in items:
        channel_id = item.get("id", {}).get("channelId")
        if not channel_id or channel_id not in stats:
            continue
        ch_stats = stats[channel_id]
        snippet = item.get("snippet", {})
        handle = ch_stats.get("handle")  # stored without leading @
        profile_url = (
            f"https://www.youtube.com/@{handle}"
            if handle
            else f"https://www.youtube.com/channel/{channel_id}"
        )
        results.append({
            "channel_id": channel_id,
            "title": ch_stats.get("title") or snippet.get("title", ""),
            "description": ch_stats.get("description") or snippet.get("description", ""),
            "profile_url": profile_url,
            "handle": handle,
            "subscribers": ch_stats.get("subscribers"),
        })

    # Keep YouTube's relevance ordering — it already ranks most relevant channels first.
    # (Sorting by subscribers here would push large off-topic channels to the top.)
    return results


async def _search_youtube_channels_searchapi(query: str, num_results: int, api_key: str) -> list[dict]:
    """Search YouTube channels via SearchAPI.io (engine=youtube, type=channel).

    Returns list of dicts: {channel_id, title, description, profile_url, handle, subscribers}
    SearchAPI returns subscriber counts as strings ("2.2M subscribers") — parsed via _extract_subscribers.
    """
    import httpx

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            "https://www.searchapi.io/api/v1/search",
            params={
                "engine": "youtube",
                "search_query": query,
                "type": "channel",
                "api_key": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    seen_ids: set[str] = set()

    # SearchAPI returns channel_results for type=channel
    for item in data.get("channel_results", []):
        channel_url = item.get("channel_url", "") or ""
        # Extract channel_id or handle from channel_url
        parsed = urlparse(channel_url)
        path = parsed.path.strip("/")

        channel_id = None
        handle = None

        m = re.match(r"^@(.+)", path)
        if m:
            handle = m.group(1).lstrip("@")
        elif re.match(r"^channel/(.+)", path):
            channel_id = re.match(r"^channel/(.+)", path).group(1)

        # Fall back to channel_id field if present
        if not channel_id:
            channel_id = item.get("channel_id") or handle or channel_url

        if not channel_id or channel_id in seen_ids:
            continue
        seen_ids.add(channel_id)

        title = (item.get("title") or "").strip()
        if not title:
            continue

        # Skip auto-generated music/topic channels
        if title.endswith("- Topic") or "Auto-generated" in title:
            continue

        # Subscriber count: SearchAPI may give int or string
        raw_subs = item.get("subscribers") or item.get("subscriber_count") or ""
        if isinstance(raw_subs, int):
            subscribers = raw_subs
        else:
            subscribers = _extract_subscribers(str(raw_subs))

        description = (item.get("description") or "").strip()

        profile_url = (
            f"https://www.youtube.com/@{handle}"
            if handle
            else channel_url or f"https://www.youtube.com/channel/{channel_id}"
        )

        results.append({
            "channel_id": channel_id,
            "title": title,
            "description": description,
            "profile_url": profile_url,
            "handle": handle,
            "subscribers": subscribers,
        })

        if len(results) >= num_results:
            break

    return results


async def _search_instagram_google_cse(
    query: str, num_results: int, api_key: str, cx: str
) -> list[dict]:
    """Discover Instagram profiles via Google Custom Search Engine.

    The CSE should be restricted to instagram.com.
    Returns list of dicts: {handle, display_name, profile_url, snippet}
    Free tier: 100 queries/day.
    """
    import httpx

    profiles = []
    seen_urls: set[str] = set()
    # Google CSE max 10 per request; paginate up to num_results
    start = 1
    while len(profiles) < num_results and start <= 91:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={
                    "key": api_key,
                    "cx": cx,
                    "q": f"site:instagram.com {query}",
                    "num": min(10, num_results - len(profiles)),
                    "start": start,
                    "gl": "es",
                    "lr": "lang_es",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        items = data.get("items", [])
        if not items:
            break

        for item in items:
            url = item.get("link", "")
            handle, profile_url = _extract_profile(url, item.get("title", ""), "instagram")
            if not profile_url:
                continue
            norm = profile_url.rstrip("/").lower()
            if norm in seen_urls:
                continue
            seen_urls.add(norm)

            title_raw = item.get("title", "")
            # Only use title as display name when it looks like a profile title
            # (contains "Instagram" marker or "(@handle)").  Otherwise the CSE
            # returned an article/post title — fall back to the handle.
            _is_profile_title = any(
                m in title_raw.lower()
                for m in [" • instagram", " | instagram", " - instagram", "(@"]
            )
            if _is_profile_title:
                display_name = _clean_title(title_raw, "instagram") or (handle or "").lstrip("@")
            else:
                raw_handle = (handle or "").lstrip("@")
                display_name = re.sub(r"[._]", " ", raw_handle).title() if raw_handle else ""
            profiles.append({
                "handle": (handle or "").lstrip("@") or None,
                "display_name": display_name,
                "profile_url": profile_url,
                "snippet": item.get("snippet", ""),
            })
            if len(profiles) >= num_results:
                break

        # Each page returns up to 10 items
        start += 10
        if len(items) < 10:
            break

    return profiles


async def _enrich_instagram_metatag(handles: list[str]) -> dict[str, int]:
    """Fetch Instagram follower counts for a list of handles by scraping the
    og:description meta tag from each profile page.

    Format: "600M Followers, 500 Following, 3.5K Posts - See Instagram photos..."
    Free and requires no API key.  Throttled to avoid IP blocks.
    """
    import httpx

    result: dict[str, int] = {}
    # Use a realistic browser User-Agent to reduce block rate
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "es-ES,es;q=0.9",
    }
    for handle in handles[:30]:  # cap at 30 to avoid IP blocks
        h = handle.lstrip("@")
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers, follow_redirects=True) as client:
                resp = await client.get(f"https://www.instagram.com/{h}/")
            if resp.status_code != 200:
                continue
            # Find og:description meta tag
            m = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', resp.text)
            if not m:
                m = re.search(r'<meta\s+content="([^"]*)"\s+property="og:description"', resp.text)
            if m:
                content = m.group(1)
                followers = _extract_subscribers(content)
                if followers:
                    result[h.lower()] = followers
        except Exception:
            pass
        # Small delay to be polite
        await asyncio.sleep(0.5)
    return result


async def _enrich_instagram_apify(handles: list[str], token: str) -> dict[str, int]:
    """Fetch Instagram follower counts for a batch of handles via Apify.

    Uses actor apify/instagram-profile-scraper (run-sync, waits for result).
    Returns dict mapping handle → followers_count.
    Free tier: ~$5/mo credit ≈ 2,500 profiles/month.
    """
    import httpx

    if not handles:
        return {}

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Run the actor synchronously and get dataset items directly
        resp = await client.post(
            "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items",
            params={"token": token},
            json={"usernames": handles},
        )
        if resp.status_code not in (200, 201):
            print(f"[influencer] Apify returned {resp.status_code}: {resp.text[:200]}")
            return {}
        items = resp.json()

    result: dict[str, int] = {}
    for item in items:
        username = (item.get("username") or "").lower()
        followers = item.get("followersCount") or item.get("followers_count")
        if username and isinstance(followers, int):
            result[username] = followers
    return result


def _extract_profile(url: str, title: str, platform: str) -> tuple[str | None, str | None]:
    """Return (handle, canonical_profile_url) for the influencer."""
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
    except Exception:
        return None, None

    if platform == "youtube":
        # /@username format
        m = re.match(r"^@([^/]+)", path)
        if m:
            handle = f"@{m.group(1)}"
            return handle, f"https://www.youtube.com/{handle}"
        # /channel/UC... format
        m = re.match(r"^channel/([^/]+)", path)
        if m:
            channel_id = m.group(1)
            return channel_id, f"https://www.youtube.com/channel/{channel_id}"
        # /user/username format
        m = re.match(r"^user/([^/]+)", path)
        if m:
            handle = f"@{m.group(1)}"
            return handle, f"https://www.youtube.com/user/{m.group(1)}"
        # Video URL — skip: we only want channel pages
        if "watch" in url or "/shorts/" in path or "?v=" in url:
            return None, None

        return None, url  # other YouTube page (e.g. /c/channelname)

    elif platform == "instagram":
        # Only parse instagram.com domains as path-based profiles
        if "instagram.com" in (parsed.netloc or ""):
            parts = path.split("/")
            # Profile URL: instagram.com/{username}/ — username not in reserved words
            _reserved = {"p", "reel", "tv", "explore", "stories", "accounts", "direct"}
            if parts and parts[0] and parts[0] not in _reserved:
                handle = f"@{parts[0]}"
                return handle, f"https://www.instagram.com/{parts[0]}/"
        # Non-instagram.com URL OR post/reel: try to extract @handle from title
        # (e.g. "Laura Encina | Finanzas (@lauraencinaoficial) • Instagram..." or
        #  article titles mentioning "@handle")
        m = re.search(r"@([A-Za-z0-9_.]{3,30})", title)
        if m:
            h = m.group(1)
            return f"@{h}", f"https://www.instagram.com/{h}/"
        return None, None  # skip pages we can't associate with an Instagram profile

    return None, url


def _extract_subscribers(text: str | None) -> int | None:
    """Try to parse subscriber/follower count from SERP snippet or title.

    Handles formats: "186K subscribers", "2,2M seguidores", "1.200 followers",
    "1.2M suscriptores", "450K Followers", "1,3M seguidores".
    """
    if not text:
        return None
    m = re.search(
        r"([\d][\d,.]*)\s*([KMBkmb]?)\s*(subscribers?|followers?|suscriptores?|seguidores?)",
        text,
        re.IGNORECASE,
    )
    if not m:
        return None
    try:
        raw = m.group(1)
        suffix = m.group(2).upper()

        if "." in raw and "," not in raw:
            # Dot present: decimal (1.2M) vs thousands separator (1.200)
            parts = raw.split(".")
            if suffix in ("K", "M", "B") or len(parts[-1]) != 3:
                num = float(raw)          # decimal: "1.2M"
            else:
                num = float(raw.replace(".", ""))  # thousands: "1.200"
        elif "," in raw and "." not in raw:
            # Comma present: Spanish decimal (2,2M) vs English thousands (1,200)
            parts = raw.split(",")
            if suffix in ("K", "M", "B") and len(parts[-1]) in (1, 2):
                num = float(raw.replace(",", "."))  # Spanish decimal: "2,2M"
            else:
                num = float(raw.replace(",", ""))   # thousands: "1,200"
        else:
            num = float(raw)

        if suffix == "K":
            num *= 1_000
        elif suffix == "M":
            num *= 1_000_000
        elif suffix == "B":
            num *= 1_000_000_000
        return int(num)
    except Exception:
        return None


def _is_non_spanish(text: str) -> bool:
    """Return True if text appears to be in a non-Spanish language (e.g. Portuguese, English).

    Uses a lightweight heuristic: count exclusive marker words for each language.
    Avoids heavy dependencies like langdetect.
    """
    if not text:
        return False
    t = text.lower()

    # Strong Portuguese markers (words that don't appear in Spanish)
    pt_markers = [
        "você", "vocês", "estou", "estão", "também", "porque", "então",
        "nosso", "nossa", "muito", "obrigado", "obrigada", "já", "ainda",
        "canal", "vídeo", "inscreva", "inscreva-se", "siga-nos",
        " em ", " para ", " com ", " como ", " mas ", " por ", " sem ",
    ]
    # Strong English markers
    en_markers = [
        " the ", " and ", " with ", " for ", " this ", " from ", " that ",
        " have ", " will ", " about ", " your ", " our ", "subscribe",
        "unboxing", "review", "tutorial",
    ]
    # Spanish markers (to confirm it IS Spanish, reduce false positives)
    es_markers = [
        " el ", " la ", " los ", " las ", " en ", " con ", " por ",
        " que ", " de ", " del ", " un ", " una ", " es ",
        "español", "españa", "canal", "suscríbete", "sígueme",
    ]

    pt_score = sum(1 for w in pt_markers if w in t)
    en_score = sum(1 for w in en_markers if w in t)
    es_score = sum(1 for w in es_markers if w in t)

    # If clearly Portuguese or English AND not clearly Spanish → reject
    if (pt_score >= 2 or en_score >= 3) and es_score <= 1:
        return True
    return False


def _clean_title(title: str, platform: str) -> str:
    """Return a clean display name from a SERP title."""
    if platform == "instagram":
        # "Elena Martín (@elena.martin) • Instagram photos and videos"
        if " • " in title:
            title = title.split(" • ")[0].strip()
        elif " | Instagram" in title:
            title = title.split(" | Instagram")[0].strip()
        elif " - Instagram" in title:
            title = title.split(" - Instagram")[0].strip()
        # Strip trailing " (@handle)" — keep only the real name
        title = re.sub(r"\s*\(@[^)]+\)\s*$", "", title).strip()
        # Strip leading "@" if present
        title = title.lstrip("@").strip()
        # If result looks like a raw handle (lowercase + underscores/dots, no spaces),
        # format it as readable words
        if title and title == title.lower() and " " not in title:
            title = re.sub(r"[._]", " ", title).title()
        return title

    for suffix in (" - YouTube", " • YouTube", " | YouTube", " - YouTube Music", " • YouTube Music"):
        if title.endswith(suffix):
            title = title[: -len(suffix)]
    # Also skip remaining "- Topic" suffix (auto-generated artist channel)
    if title.endswith("- Topic"):
        title = title[: -len("- Topic")].strip()
    return title.strip()


def _build_reason(
    platform: str,
    display_name: str,
    snippet: str | None,
    company_type: str | None,
    niche_keywords: str,
) -> str:
    """Build a short explanation of why this influencer is recommended."""
    platform_label = "YouTube" if platform == "youtube" else "Instagram"
    topic = company_type or niche_keywords or "el sector"
    name = _clean_title(display_name, platform)
    if snippet:
        # Use first sentence of snippet as context
        first_sentence = re.split(r"[.!?]", snippet)[0].strip()
        if len(first_sentence) > 20:
            return f"Creador de {platform_label} sobre {topic}. {first_sentence}."
    return f"Creador de contenido en {platform_label} especializado en {topic}."


async def _update_job(
    session,
    job_id: str,
    *,
    status: str | None = None,
    progress: float | None = None,
    result: dict | None = None,
    step_info: dict | None = None,
    error: str | None = None,
):
    from sqlalchemy import select as sa_select
    job_result = await session.execute(
        sa_select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id))
    )
    job = job_result.scalar_one_or_none()
    if not job:
        return
    if status:
        job.status = status
        if status == "running" and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
        if status in ("completed", "failed"):
            job.completed_at = datetime.now(timezone.utc)
    if progress is not None:
        job.progress = progress
    if result is not None:
        job.result = result
    if step_info is not None:
        job.step_info = step_info
    if error is not None:
        job.error = error
    await session.commit()
