#!/usr/bin/env python3
"""Poll the official JMD English CAP RSS feed and send only newly seen alerts via OneSignal.

The first successful run records a baseline without sending historical alerts.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

FEED = 'https://cap-sources.s3.amazonaws.com/jo-meteo-en/rss.xml'
STATE_PATH = Path('data/last-alert.json')
PETRA_TERMS = [
    'petra', 'wadi musa', "ma'an governorate", 'maan governorate'
]


def get(url, headers=None, timeout=25):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'PetraWeatherAlerts/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def text_of(node, names):
    names = {n.lower() for n in names}
    for child in node.iter():
        tag = child.tag.split('}')[-1].lower()
        if tag in names and child.text:
            return html.unescape(re.sub(r'<[^>]+>', ' ', child.text)).strip()
    return ''


def translate_ar(text):
    text = re.sub(r'\s+', ' ', html.unescape(text or '')).strip()
    if not text:
        return 'صدر تحذير جوي رسمي للأردن. يرجى متابعة التفاصيل في موقع فريق طقس البتراء.'
    # Google Translate's public endpoint is best-effort; use a conservative phrase fallback if unavailable.
    try:
        q = urllib.parse.urlencode({'client': 'gtx', 'sl': 'en', 'tl': 'ar', 'dt': 't', 'q': text[:3500]})
        data = json.loads(get('https://translate.googleapis.com/translate_a/single?' + q, timeout=15).decode('utf-8'))
        result = ''.join(part[0] for part in (data[0] or []) if part and part[0]).strip()
        if result:
            return result
    except Exception as exc:
        print('Translation unavailable; using fallback:', exc)
    replacements = [
        (r'(?i)severe weather warning', 'تحذير من أحوال جوية شديدة'),
        (r'(?i)weather warning', 'تحذير جوي'), (r'(?i)thunderstorms?', 'عواصف رعدية'),
        (r'(?i)heavy rainfall|heavy rain', 'أمطار غزيرة'), (r'(?i)flash flood(?:ing)?', 'سيول مفاجئة'),
        (r'(?i)flood(?:ing)?', 'سيول'), (r'(?i)strong winds?|high winds?', 'رياح قوية'),
        (r'(?i)dust storm', 'عاصفة غبارية'), (r'(?i)snowfall|snow', 'تساقط الثلوج'),
        (r'(?i)fog', 'ضباب'), (r'(?i)frost', 'صقيع'), (r'(?i)heatwave|heat wave', 'موجة حر'),
        (r'(?i)cold wave', 'موجة برد'), (r'(?i)jordan', 'الأردن'),
        (r'(?i)warning', 'تحذير'), (r'(?i)issued', 'صدر'), (r'(?i)expires', 'ينتهي')
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text)
    if re.search(r'[A-Za-z]{4,}', text):
        return 'صدر تحذير جوي رسمي للأردن. تعذرت الترجمة الكاملة آليًا؛ يرجى مراجعة نص التحذير في الموقع.'
    return text


def parse_feed(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = [e for e in root.iter() if e.tag.split('}')[-1].lower() in ('item', 'entry')]
    result = []
    for item in items:
        title = text_of(item, ['title']) or 'تحذير جوي رسمي'
        desc = text_of(item, ['description', 'summary', 'headline', 'instruction', 'event'])
        guid = text_of(item, ['guid', 'id']) or text_of(item, ['link']) or (title + '|' + desc)
        link = text_of(item, ['link'])
        sent = text_of(item, ['sent', 'pubDate', 'published', 'updated', 'date'])
        expires = text_of(item, ['expires'])
        area = text_of(item, ['areaDesc', 'area', 'region'])
        severity = text_of(item, ['severity'])
        urgency = text_of(item, ['urgency'])
        result.append({'id': guid, 'title': title, 'description': desc, 'link': link,
                       'sent': sent, 'expires': expires, 'area': area,
                       'severity': severity, 'urgency': urgency})
    return result


def is_expired(alert):
    value = alert.get('expires', '').strip()
    if not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp() < time.time()
    except ValueError:
        try:
            from email.utils import parsedate_to_datetime
            parsed = parsedate_to_datetime(value)
            return parsed.timestamp() < time.time()
        except Exception:
            return False


def includes_petra(alert):
    haystack = ' '.join([alert.get('title', ''), alert.get('description', ''), alert.get('area', '')]).lower()
    return any(term in haystack for term in PETRA_TERMS)


def send_push(alert):
    app_id = os.environ.get('ONESIGNAL_APP_ID', '').strip()
    api_key = os.environ.get('ONESIGNAL_REST_API_KEY', '').strip()
    if not app_id or not api_key:
        raise RuntimeError('Missing GitHub secrets ONESIGNAL_APP_ID and/or ONESIGNAL_REST_API_KEY')
    title_ar = translate_ar(alert['title'])
    desc_ar = translate_ar(alert.get('description') or alert['title'])
    petra = includes_petra(alert)
    heading = ('⚠️ تحذير رسمي يشمل البتراء' if petra else '⚠️ تحذير جوي رسمي في الأردن')
    area_ar = translate_ar(alert.get('area', '')) if alert.get('area') else ''
    body_parts = [title_ar]
    if area_ar:
        body_parts.append('المناطق: ' + area_ar)
    if desc_ar and desc_ar != title_ar:
        body_parts.append(desc_ar[:500])
    if alert.get('severity'):
        body_parts.append('درجة الخطورة: ' + translate_ar(alert['severity']))
    payload = {
        'app_id': app_id,
        'target_channel': 'push',
        'included_segments': ['Subscribed Users'],
        'headings': {'ar': heading, 'en': 'Official Jordan weather alert'},
        'contents': {'ar': '\n'.join(body_parts)[:1800], 'en': (alert['title'] + ' — ' + alert.get('description', ''))[:1800]},
        'url': 'https://talalhamadeen-png.github.io/petraweather/',
        'data': {'alert_id': alert['id'], 'includes_petra': petra, 'severity': alert.get('severity', '')},
        'web_push_topic': re.sub(r'[^A-Za-z0-9_-]', '-', alert['id'])[:60]
    }
    req = urllib.request.Request('https://api.onesignal.com/notifications', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json; charset=utf-8', 'Authorization': 'Key ' + api_key}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            print('OneSignal response:', response.status, response.read().decode('utf-8', 'replace')[:1000])
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'OneSignal API returned HTTP {exc.code}: {exc.read().decode("utf-8", "replace")[:1000]}')


def main():
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE_PATH.read_text('utf-8')) if STATE_PATH.exists() else {'initialized': False, 'seen': []}
    alerts = parse_feed(get(FEED, timeout=30))
    seen = set(state.get('seen', []))
    current_ids = [a['id'] for a in alerts if a.get('id')]
    if not state.get('initialized'):
        state['initialized'] = True
        state['seen'] = current_ids[:300]
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', 'utf-8')
        print(f'Initialized baseline with {len(current_ids)} existing alert(s); no historical push sent.')
        return
    new_alerts = [a for a in alerts if a.get('id') and a['id'] not in seen and not is_expired(a)]
    # Oldest first, to preserve order when more than one alert appears between checks.
    new_alerts.reverse()
    for alert in new_alerts:
        print('New official alert:', alert['title'], 'Petra coverage:', includes_petra(alert))
        send_push(alert)
        seen.add(alert['id'])
    # Retain a bounded dedupe set; include currently listed feed items first.
    ordered = []
    for item_id in current_ids + list(seen):
        if item_id not in ordered:
            ordered.append(item_id)
    state['seen'] = ordered[:300]
    state['last_checked_utc'] = datetime.now(timezone.utc).isoformat()
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(f'Feed entries: {len(alerts)}; newly sent: {len(new_alerts)}')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Alert polling failed:', exc, file=sys.stderr)
        raise
