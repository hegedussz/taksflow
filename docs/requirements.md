# Követelmények – StudyRoom

> A **StudyRoom** egy webes alkalmazás, amelyben az egyetemi hallgatók megkereshetik és lefoglalhatják a campus tanulószobáit, az adminisztrátorok pedig kezelhetik a termeket és a foglalásokat.

## Tartalomjegyzék

1. [Szerepkörök](#szerepkörök)
2. [Funkcionális követelmények](#funkcionális-követelmények)
3. [Nem funkcionális követelmények](#nem-funkcionális-követelmények)

---

## Szerepkörök

| Szerepkör | Leírás |
|-----------|--------|
| **Vendég** | Be nem jelentkezett látogató |
| **Hallgató** | Egyetemi e-mail-címmel regisztrált felhasználó |
| **Adminisztrátor** | A termeket és foglalásokat kezelő egyetemi munkatárs |

---

## Funkcionális követelmények

### FR-01 – Regisztráció

**Leírás:** Vendégként szeretnék regisztrálni az egyetemi e-mail-címemmel, hogy tanulószobát foglalhassak.

**Elfogadási kritériumok:**

- **AC-01.1:** Adott, hogy a regisztrációs oldalon vagyok, amikor érvényes egyetemi e-mail-címet (`@*.nye.hu`) és a jelszószabályoknak megfelelő jelszót adok meg, akkor a fiókom létrejön, és megerősítő e-mailt kapok.
- **AC-01.2:** Adott, hogy a regisztrációs oldalon vagyok, amikor nem egyetemi e-mail-címet adok meg, akkor a regisztráció elutasításra kerül „Csak egyetemi e-mail-cím fogadható el” üzenettel.
- **AC-01.3:** Adott, hogy az e-mail-címemmel már létezik fiók, amikor újra regisztrálni próbálok, akkor a rendszer elutasítja a regisztrációt, és felajánlja a jelszó-visszaállítást.

---

### FR-02 – Bejelentkezés és kijelentkezés

**Leírás:** Hallgatóként szeretnék be- és kijelentkezni, hogy a foglalásaimat csak én kezelhessem.

**Elfogadási kritériumok:**

- **AC-02.1:** Adott, hogy megerősített fiókom van, amikor helyes e-mail-címet és jelszót adok meg, akkor bejelentkezem, és a kezdőlapra (dashboard) kerülök.
- **AC-02.2:** Adott, hogy hibás jelszót adok meg, amikor elküldöm a bejelentkezési űrlapot, akkor általános „Hibás e-mail-cím vagy jelszó” hibaüzenetet kapok, amely nem árulja el, melyik mező volt hibás.
- **AC-02.3:** Adott, hogy 15 percen belül 5-ször sikertelenül próbáltam bejelentkezni, amikor újra próbálkozom, akkor a bejelentkezésem 15 percre zárolásra kerül.
- **AC-02.4:** Adott, hogy be vagyok jelentkezve, amikor a „Kijelentkezés” gombra kattintok, akkor a munkamenetem érvénytelenné válik, és a nyitóoldalra kerülök.

---

### FR-03 – Termek böngészése és szűrése

**Leírás:** Hallgatóként szeretném listázni és szűrni a tanulószobákat, hogy megtaláljam az igényeimnek megfelelőt.

**Elfogadási kritériumok:**

- **AC-03.1:** Adott, hogy be vagyok jelentkezve, amikor megnyitom a „Termek” oldalt, akkor látom az összes aktív termet a nevével, épületével, férőhelyével és felszereltségével.
- **AC-03.2:** Adott, hogy a „Termek” oldalon vagyok, amikor épületre, minimális férőhelyre vagy felszereltségre (pl. projektor, tábla) szűrök, akkor csak az összes kiválasztott feltételnek megfelelő termek jelennek meg.
- **AC-03.3:** Adott, hogy egyetlen terem sem felel meg a szűrésnek, amikor megjelenik a találati lista, akkor „Nincs a szűrésnek megfelelő terem” üzenet látható.

---

### FR-04 – Terem foglaltságának megtekintése

**Leírás:** Hallgatóként szeretném látni egy terem szabad és foglalt idősávjait, hogy megfelelő időpontot választhassak.

**Elfogadási kritériumok:**

- **AC-04.1:** Adott, hogy megnyitom egy terem részletes oldalát, amikor az oldal betöltődik, akkor heti naptárnézetet látok, amelyben a foglalt idősávok nem választhatóként vannak jelölve.
- **AC-04.2:** Adott, hogy a naptárat nézem, amikor a következő hétre lapozok, akkor az adott hét foglaltsága jelenik meg.
- **AC-04.3:** Adott, hogy a terem egy adott napon zárva tart (pl. hétvégén), amikor azt a napot nézem, akkor az egész nap nem foglalhatóként jelenik meg.

---

### FR-05 – Foglalás létrehozása

**Leírás:** Hallgatóként szeretnék termet foglalni egy idősávra, hogy biztosan legyen helyem tanulni.

**Elfogadási kritériumok:**

- **AC-05.1:** Adott, hogy a kiválasztott idősáv szabad, amikor megerősítem a foglalást, akkor a foglalás mentésre kerül, az idősáv mások számára foglalttá válik, és visszaigazoló e-mailt kapok.
- **AC-05.2:** Adott, hogy egy másik felhasználó pillanatokkal korábban lefoglalta ugyanazt az idősávot, amikor megerősítem a foglalást, akkor a foglalásom elutasításra kerül „Ez az idősáv már nem elérhető” üzenettel.
- **AC-05.3:** Adott, hogy 3 óránál hosszabb időtartamot választok, amikor megpróbálom megerősíteni, akkor a foglalás elutasításra kerül, mert a maximális foglalási idő 3 óra.
- **AC-05.4:** Adott, hogy már 2 aktív jövőbeli foglalásom van, amikor harmadikat próbálok létrehozni, akkor a foglalás a felhasználónkénti korlát miatt elutasításra kerül.

---

### FR-06 – Foglalás lemondása

**Leírás:** Hallgatóként szeretném lemondani a foglalásomat, hogy ha mégsem tudok menni, a terem mások számára felszabaduljon.

**Elfogadási kritériumok:**

- **AC-06.1:** Adott, hogy van egy több mint 1 óra múlva kezdődő foglalásom, amikor lemondom, akkor a foglalás törlődik, és az idősáv újra szabaddá válik.
- **AC-06.2:** Adott, hogy a foglalásom kevesebb mint 1 óra múlva kezdődik, amikor lemondom, akkor a lemondás megtörténik, de késői lemondásként kerül rögzítésre.
- **AC-06.3:** Adott, hogy egy foglalás másik felhasználóhoz tartozik, amikor megpróbálom lemondani (pl. közvetlen URL-lel), akkor „403 Forbidden” választ kapok.

---

### FR-07 – Saját foglalások

**Leírás:** Hallgatóként szeretném látni a foglalásaim listáját, hogy nyomon követhessem őket.

**Elfogadási kritériumok:**

- **AC-07.1:** Adott, hogy be vagyok jelentkezve, amikor megnyitom a „Foglalásaim” oldalt, akkor kezdési időpont szerint rendezve látom a közelgő foglalásaimat.
- **AC-07.2:** Adott, hogy vannak korábbi foglalásaim, amikor az „Előzmények” fülre váltok, akkor látom az elmúlt 90 nap foglalásait.

---

### FR-08 – Emlékeztető a foglalás előtt

**Leírás:** Hallgatóként szeretnék emlékeztetőt kapni a foglalásom előtt, hogy ne felejtsem el.

**Elfogadási kritériumok:**

- **AC-08.1:** Adott, hogy van foglalásom, amikor a kezdésig 30 perc van hátra, akkor emlékeztető e-mailt kapok.
- **AC-08.2:** Adott, hogy a profilbeállításaimban kikapcsoltam az emlékeztetőket, amikor a kezdésig 30 perc van hátra, akkor nem kapok emlékeztetőt.

---

### FR-09 – Termek kezelése (adminisztrátor)

**Leírás:** Adminisztrátorként szeretnék termeket létrehozni, szerkeszteni és inaktiválni, hogy a teremlista mindig a valóságot tükrözze.

**Elfogadási kritériumok:**

- **AC-09.1:** Adott, hogy adminisztrátorként vagyok bejelentkezve, amikor létrehozok egy termet névvel, épülettel, férőhellyel és felszereltséggel, akkor a terem megjelenik a hallgatók teremlistájában.
- **AC-09.2:** Adott, hogy egy teremhez jövőbeli foglalások tartoznak, amikor inaktiválom, akkor a terem eltűnik a listából, az érintett foglalások törlődnek, és a hallgatók értesítő e-mailt kapnak.
- **AC-09.3:** Adott, hogy hallgatóként vagyok bejelentkezve, amikor megpróbálom elérni a teremkezelő oldalt, akkor „403 Forbidden” választ kapok.

---

### FR-10 – Foglalási statisztikák (adminisztrátor)

**Leírás:** Adminisztrátorként szeretném látni a termek kihasználtsági statisztikáit, hogy megtervezhessem a termek számát és méretét.

**Elfogadási kritériumok:**

- **AC-10.1:** Adott, hogy a statisztikák oldalon vagyok, amikor kiválasztok egy időszakot, akkor látom az egyes termek kihasználtságát százalékban az adott időszakra.
- **AC-10.2:** Adott, hogy a statisztikákat nézem, amikor a „CSV exportálás” gombra kattintok, akkor letöltődik egy CSV-fájl a megjelenített adatokkal.

---

## Nem funkcionális követelmények

Minden csapattag két követelményt fogalmazott meg.

| Azonosító | Kategória | Felelős |
|-----------|-----------|---------|
| NFR-01, NFR-02 | Teljesítmény | 1. csapattag |
| NFR-03, NFR-04 | Biztonság | 2. csapattag |
| NFR-05, NFR-06 | Megbízhatóság | 3. csapattag |
| NFR-07, NFR-08 | Használhatóság és hordozhatóság | 4. csapattag |

### NFR-01 – Oldalbetöltési idő *(Teljesítmény)*

A fő oldalaknak (teremlista, terem részletei, saját foglalások) a kérések 95%-ában (p95) **2 másodpercen belül** be kell töltődniük, 20 Mbit/s-os kapcsolaton mérve.

**Ellenőrzés:** Lighthouse / k6 mérés a staging környezetben.

### NFR-02 – Egyidejű felhasználók *(Teljesítmény)*

A rendszernek legalább **500 egyidejű felhasználót** kell kiszolgálnia úgy, hogy az API válaszideje **500 ms alatt (p95)** maradjon, a hibaarány pedig 1% alatt.

**Ellenőrzés:** k6 terheléses teszt 500 virtuális felhasználóval, 10 percen át.

### NFR-03 – Jelszavak tárolása *(Biztonság)*

A jelszavakat tilos nyílt szövegként tárolni; **bcrypt (cost ≥ 12)** vagy **Argon2id** algoritmussal kell hash-elni őket. A jelszó legalább 10 karakter hosszú, és tartalmaz betűt és számjegyet. Minden kommunikáció **HTTPS-en (TLS 1.2+)** történik.

**Ellenőrzés:** Kódáttekintés; az adatbázisban kizárólag hash-ek láthatók.

### NFR-04 – Adatvédelem (GDPR) *(Biztonság)*

A rendszer csak a működéshez szükséges személyes adatokat tárolja (név, e-mail-cím, foglalások). A felhasználónak lehetősége van az adatai **exportálására** és a fiókja **törlésére**; törléskor a személyes adatokat **30 napon belül** törölni vagy anonimizálni kell. Az 1 évnél régebbi foglalási előzmények automatikusan anonimizálódnak.

**Ellenőrzés:** Az export- és törlési folyamat manuális tesztje; az ütemezett anonimizáló feladat ellenőrzése.

### NFR-05 – Rendelkezésre állás *(Megbízhatóság)*

A rendszer havi rendelkezésre állása legalább **99,5%** (havonta legfeljebb kb. 3,6 óra leállás), a bejelentett karbantartási időablakot (vasárnap 02:00–04:00) nem számítva.

**Ellenőrzés:** Uptime-monitorozás (pl. Uptime Kuma), havi riporttal.

### NFR-06 – Mentés és helyreállítás *(Megbízhatóság)*

Az adatbázisról **naponta** mentés készül, amelyet **14 napig** megőrzünk. Hiba esetén a rendszert **4 órán belül (RTO)** helyre kell állítani, legfeljebb **24 órányi adatvesztéssel (RPO)**.

**Ellenőrzés:** Félévente legalább egy visszaállítási teszt.

### NFR-07 – Használhatóság *(Használhatóság)*

Egy új felhasználónak segítség nélkül, **3 percen belül** és a nyitóoldaltól legfeljebb **5 kattintással** kell tudnia foglalást létrehozni. A felület **magyar és angol** nyelven érhető el, és megfelel a **WCAG 2.1 AA** szintnek (kontraszt, billentyűzetes navigáció).

**Ellenőrzés:** Használhatósági teszt 5 hallgatóval; Lighthouse akadálymentességi pontszám ≥ 90.

### NFR-08 – Hordozhatóság *(Hordozhatóság)*

Az alkalmazás reszponzív webalkalmazás, amelynek a **Chrome, Firefox, Safari és Edge** legutóbbi két verzióján kell működnie asztali gépen és mobilon is (legalább 360 px képernyőszélességtől). A backend **Docker-konténerben** fut, így bármely Linux-alapú szerverre telepíthető.

**Ellenőrzés:** Manuális böngészőteszt; a `docker compose up` parancs elindítja a teljes rendszert.
