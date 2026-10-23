#!/usr/bin/env python3
"""Fetch recent weather/road-safety posts from the Jordan PSD official news archive."""
import json, re, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE = 'https://www.psd.gov.jo'
ARCHIVE = 'https://www.psd.gov.jo/ar-jo/المحتوى/أرشيف-الأخبار/?page=1'
OUT = Path('data/psd-alerts.json')
KEYWORDS = ('الطرق', 'إغلاق', 'اغلاق', 'إغلاقات', 'اغلاقات', 'سالك', 'سيول', 'السيول', 'جوي', 'الأمطار', 'الامطار', 'الطقس', 'الغبار', 'الضباب', 'الرؤية', 'انجماد', 'ثلوج', 'رياح', 'فيضانات', 'منخفض', 'حالة عدم الاستقرار', 'حوادث السير', 'الدوريات الخارجية')
HEADERS = {'User-Agent': 'PetraWeatherAlertsBot/1.0 (public safety alert display; GitHub Actions)'}


def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def parse_date(text):
    text = clean(text)
    m = re.search(r'(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[،, ]+.*?([0-2]?\d):([0-5]\d)(?:\s*(صباحًا|مساءً|صباحا|مساء|AM|PM))?)?', text, re.I)
    if not m:
        return ''
    try:
        hour = int(m.group(4) or 12); minute = int(m.group(5) or 0)
        meridiem = (m.group(6) or '').lower()
        if meridiem in ('مساءً','مساء','pm') and hour < 12: hour += 12
        if meridiem in ('صباحًا','صباحا','am') and hour == 12: hour = 0
        # The archive may publish only a calendar date; noon UTC is a neutral estimate
        # until the official page provides an exact publication time.
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), hour, minute, tzinfo=timezone.utc).isoformat()
    except ValueError:
        return ''


def main():
    now = datetime.now(timezone.utc)
    r = requests.get(ARCHIVE, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    items, seen = [], set()
    for a in soup.select('a[href]'):
        title = clean(a.get_text(' ', strip=True))
        href = urljoin(BASE, a.get('href', ''))
        if not title or len(title) < 10 or href in seen:
            continue
        if 'psd.gov.jo' not in href or '/المحتوى/أرشيف-الأخبار/' not in href:
            continue
        if '?page=' in href or href.rstrip('/') == ARCHIVE.rstrip('/'):
            continue
        if not any(k in title for k in KEYWORDS):
            continue
        seen.add(href)
        parent = a
        summary = ''
        date_text = ''
        for _ in range(4):
            if parent.parent:
                parent = parent.parent
            txt = clean(parent.get_text(' ', strip=True))
            if len(txt) > len(title) + 20:
                summary = txt.replace(title, '', 1).strip(' -|،')
                date_text = txt
                break
        date = parse_date(date_text)
        if date:
            try:
                dt = datetime.fromisoformat(date)
                if now - dt > timedelta(hours=24) or dt > now + timedelta(minutes=5):
                    continue
            except ValueError:
                pass
        if len(summary) > 420:
            summary = summary[:417].rsplit(' ', 1)[0] + '…'
        items.append({'title': title[:220], 'summary': summary[:420], 'date': date[:10] if date else '', 'publishedAt': date, 'url': href})
        if len(items) >= 8:
            break
    payload = {'source': ARCHIVE, 'updatedAt': now.isoformat(), 'items': items}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(items)} PSD weather/road items to {OUT}')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PSD archive update failed: {exc}', file=sys.stderr)
        # Keep the last successful data file on transient source errors.
        sys.exit(1)
