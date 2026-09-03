import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 3 * 3600
_recent_streams: list[dict[str, Any]] = []


def clean_expired_entries() -> None:
    global _recent_streams
    cutoff = time.time() - SESSION_TTL_SECONDS
    _recent_streams = [entry for entry in _recent_streams if entry['timestamp'] >= cutoff]


def record_stream_activity(
    customer_id: int,
    customer_name: str,
    customer_token: str | None,
    device_name: str,
    ip_address: str,
    rating_keys: list[str] | set[str],
    keys: list[str] | set[str] = (),
    titles: list[str] | set[str] = (),
) -> None:
    clean_expired_entries()
    entry = {
        'customer_id': customer_id,
        'customer_name': customer_name,
        'customer_token': customer_token,
        'device_name': device_name,
        'ip_address': (ip_address or '').strip(),
        'rating_keys': {str(rk).strip() for rk in rating_keys if rk},
        'keys': {str(k).strip() for k in keys if k},
        'titles': {str(t).strip().lower() for t in titles if t},
        'timestamp': time.time(),
    }
    _recent_streams.insert(0, entry)
    if len(_recent_streams) > 500:
        _recent_streams.pop()


def find_matched_customer(
    rating_key: str = '',
    parent_rating_key: str = '',
    grandparent_rating_key: str = '',
    key: str = '',
    title: str = '',
    player_ip: str = '',
    client_identifier: str = '',
) -> dict[str, Any] | None:
    clean_expired_entries()

    rk_candidates = {
        str(k).strip() for k in (rating_key, parent_rating_key, grandparent_rating_key) if k
    }
    key_str = str(key or '').strip()
    title_str = str(title or '').strip().lower()
    ip_str = (player_ip or '').strip()
    norm_ip = ip_str.replace('::ffff:', '') if ip_str.startswith('::ffff:') else ip_str
    if norm_ip in ('::1', 'localhost'):
        norm_ip = '127.0.0.1'

    # 1. Búsqueda por rating_key / parent / grandparent
    if rk_candidates:
        for entry in _recent_streams:
            if any(cand in entry['rating_keys'] for cand in rk_candidates):
                return entry

    # 2. Búsqueda por key (path o identificador de plex)
    if key_str:
        for entry in _recent_streams:
            if key_str in entry['keys']:
                return entry

    # 3. Búsqueda por título idéntico y misma IP / red
    if title_str:
        for entry in _recent_streams:
            if title_str in entry['titles']:
                entry_ip = entry['ip_address'].replace('::ffff:', '') if entry['ip_address'].startswith('::ffff:') else entry['ip_address']
                if entry_ip in ('::1', 'localhost'):
                    entry_ip = '127.0.0.1'
                if norm_ip and (norm_ip == entry_ip or norm_ip == '127.0.0.1'):
                    return entry

    # 4. Si hay coincidencia por título reciente en los últimos 30 minutos
    if title_str:
        thirty_min_ago = time.time() - 1800
        for entry in _recent_streams:
            if entry['timestamp'] >= thirty_min_ago and title_str in entry['titles']:
                return entry

    return None
