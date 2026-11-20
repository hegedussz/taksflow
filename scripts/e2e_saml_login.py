#!/usr/bin/env python3
"""Végponttól végpontig tartó SAML2-bejelentkezési próba a docker compose környezet ellen.

Lépések: /login → teszt-IdP bejelentkezési űrlap → SAMLResponse → /saml/acs → kezdőlap.
Használat: python3 scripts/e2e_saml_login.py [APP_URL]
"""
import datetime
import html
import json
import http.cookiejar
import re
import sys
import urllib.parse
import urllib.request

APP = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")


def session():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def post(opener, url, data):
    body = urllib.parse.urlencode(data).encode()
    return opener.open(urllib.request.Request(url, data=body, method="POST"))


def field(page, name):
    m = re.search(r'name="%s"\s+value="([^"]*)"' % re.escape(name), page)
    return html.unescape(m.group(1)) if m else None


def login(username, password):
    o = session()
    # 1. Az alkalmazás az IdP-hez irányít, az IdP a bejelentkezési űrlapra.
    res = o.open(f"{APP}/login")
    page = res.read().decode()
    login_url = res.geturl()
    auth_state = field(page, "AuthState")
    assert auth_state, f"Nincs AuthState az IdP űrlapján ({login_url})"
    # 2. Bejelentkezés az IdP-nél → automatikusan beküldendő űrlap a SAMLResponse-szal.
    page = post(o, login_url.split("?")[0], {"username": username, "password": password, "AuthState": auth_state}).read().decode()
    saml_response = field(page, "SAMLResponse")
    assert saml_response, "Az IdP nem adott SAMLResponse-t"
    acs = html.unescape(re.search(r'<form[^>]+action="([^"]+)"', page).group(1))
    assert acs == f"{APP}/saml/acs", f"Váratlan ACS-cím: {acs}"
    data = {"SAMLResponse": saml_response}
    relay = field(page, "RelayState")
    if relay:
        data["RelayState"] = relay
    # 3. Az ACS ellenőrzi a választ, majd a kezdőlapra irányít.
    try:
        res = post(o, acs, data)
        return res.status, res.read().decode(), o
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(), o


status, page, opener = login("hallgato1", "password")
assert status == 200 and "Szia, Kovács Réka!" in page, f"Hallgatói belépés sikertelen ({status})"
print("OK  hallgató belépett, kezdőlap: „Szia, Kovács Réka!”")

rooms = opener.open(f"{APP}/rooms").read().decode()
assert "A/104" in rooms, "A teremlista nem jelent meg"
print("OK  teremlista elérhető a munkamenettel")

# Foglalás a felületen: a következő hétköznap 18:30–19:30 az A/104-es teremben.
room_id = re.search(r'href="/rooms/(\d+)">\s*<span class="rc-top"><span class="code">A/104<', rooms).group(1)
day = datetime.date.today() + datetime.timedelta(days=1)
while day.weekday() >= 5:
    day += datetime.timedelta(days=1)
start = f"{day.isoformat()}T18:30"
confirm = opener.open(f"{APP}/bookings/new?room={room_id}&start={urllib.parse.quote(start)}&dur=60").read().decode()
csrf = field(confirm, "_csrf")
assert csrf, "Nincs CSRF-token az összefoglaló oldalon"
done = post(opener, f"{APP}/bookings", {"_csrf": csrf, "roomId": room_id, "start": start, "dur": "60"}).read().decode()
assert "Lefoglaltad." in done, "A foglalás nem sikerült"
print(f"OK  foglalás mentve: A/104, {start}")

MAILPIT = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8025"
messages = json.load(urllib.request.urlopen(f"{MAILPIT}/api/v1/messages"))["messages"]
assert any("Foglalás visszaigazolása" in m["Subject"] for m in messages), "Nem érkezett visszaigazoló e-mail"
print("OK  a visszaigazoló e-mail megérkezett a Mailpitbe")

status, page, _ = login("admin1", "password")
assert status == 200 and "Termek kezelése" in page, f"Admin belépés sikertelen ({status})"
print("OK  adminisztrátor belépett, teremkezelés")

status, page, _ = login("kulsos", "password")
assert status == 403 and "egyetemi eduID-fiókkal" in page, f"Külsős felhasználót nem utasította el ({status})"
print("OK  más intézmény felhasználóját elutasította (403)")
