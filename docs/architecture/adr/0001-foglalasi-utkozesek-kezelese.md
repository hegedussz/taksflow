# ADR-0001: Foglalási ütközések megakadályozása adatbázis-szintű kizárási megkötéssel

| | |
|---|---|
| **Állapot** | Javasolt |
| **Dátum** | 2026-10-03 |
| **Érintett követelmények** | FR-05 (AC-05.1, AC-05.2, AC-05.3), FR-06, FR-09 (AC-09.2), NFR-02 |

---

## Kontextus

A StudyRoom alapvető ígérete, hogy egy idősávot egy teremben egyszerre **csak egy hallgató** foglalhat le. Az AC-05.2 kifejezetten előírja, hogy ha egy másik felhasználó „pillanatokkal korábban” lefoglalta ugyanazt az idősávot, a később érkező foglalást a rendszer „Ez az idősáv már nem elérhető” üzenettel utasítsa el.

A naiv megvalósítás így működik:

1. az alkalmazás lekérdezi, van-e átfedő foglalás (`SELECT`),
2. ha nincs, beszúrja az újat (`INSERT`).

Ez **versenyhelyzetet** (check-then-act) okoz: ha két kérés szinte egyszerre érkezik, mindkettő üresnek látja az idősávot, és mindkettő beszúr. Ennek az esélye éppen akkor a legnagyobb, amikor a legtöbb a felhasználó. Ilyen például a vizsgaidőszak, amelyre az NFR-02 500 egyidejű felhasználót ír elő.

További szempontok:

- A foglalások **tetszőleges kezdési és befejezési időponttal** rendelkezhetnek, legfeljebb 3 óra hosszúak (AC-05.3), tehát nem rögzített idősávokról van szó.
- A lemondott foglalások (FR-06) és a terem inaktiválása miatt törölt foglalások (AC-09.2) nem foglalhatják tovább az idősávot.
- A foglalás több kódútvonalon is létrejöhet vagy módosulhat (hallgatói felület, adminisztrátori műveletek, későbbi importok), ezért a szabály betartása nem függhet attól, hogy minden fejlesztő minden helyen helyesen implementálja-e az ellenőrzést.
- A rendszer Docker-konténerben fut (NFR-08), így az adatbázismotor szabadon megválasztható.

## Döntés

Relációs adatbázisként **PostgreSQL**-t használunk. A foglalások átfedését **adatbázis-szintű kizárási megkötéssel** (`EXCLUDE` constraint) akadályozzuk meg, amely időintervallum-típuson (`tstzrange`) és GiST indexen alapul.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
    id                BIGSERIAL   PRIMARY KEY,
    room_id           BIGINT      NOT NULL REFERENCES rooms (id),
    user_id           BIGINT      NOT NULL REFERENCES users (id),
    period            TSTZRANGE   NOT NULL,            -- félig nyitott: [kezdés, vége)
    status            TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'cancelled')),
    late_cancellation BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- AC-05.3: legfeljebb 3 óra
    CONSTRAINT bookings_max_duration
        CHECK (upper(period) - lower(period) <= INTERVAL '3 hours'),

    -- AC-05.2: ugyanabban a teremben nem lehet két átfedő aktív foglalás
    CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (room_id WITH =, period WITH &&)
        WHERE (status = 'active')
);
```

A megoldás lényeges elemei:

- **Félig nyitott intervallum (`[)`):** a 10:00–11:00 és a 11:00–12:00 foglalás nem ütközik, így az egymást követő foglalások megengedettek.
- **Részleges megkötés (`WHERE status = 'active'`):** a lemondott foglalások nem blokkolják az idősávot, ezért lemondáskor (FR-06) és a terem inaktiválásakor (AC-09.2) a foglalás állapota `cancelled` lesz. A sort nem töröljük fizikailag, így az előzmények (AC-07.2) és a statisztikák (FR-10) is megmaradnak.
- **Hibakezelés:** ütközéskor a PostgreSQL `23P01` (`exclusion_violation`) hibakódot ad. Az alkalmazás ezt **HTTP 409 Conflict** válasszá alakítja „Ez az idősáv már nem elérhető” üzenettel.
- **Időzóna:** az időpontokat `timestamptz` típusban (UTC) tároljuk, és a felületen `Europe/Budapest` szerint jelenítjük meg.

Az alkalmazásréteg továbbra is elvégez egy előzetes ellenőrzést, hogy a felhasználó gyors visszajelzést kapjon (például a naptárnézetben, AC-04.1). A **végső garanciát azonban az adatbázis adja**.

### A felhasználónkénti korlát (AC-05.4)

A „legfeljebb 2 aktív jövőbeli foglalás” szabály az aktuális időtől (`now()`) függ, ezért nem fejezhető ki megkötéssel. Ezt egy tranzakción belül kezeljük: a foglalás létrehozása előtt zároljuk a felhasználó sorát (`SELECT … FROM users WHERE id = $1 FOR UPDATE`), majd megszámoljuk az aktív jövőbeli foglalásait. Így ugyanannak a felhasználónak a párhuzamos kérései sorba rendeződnek, a különböző felhasználók kérései viszont nem várnak egymásra.

## Megfontolt alternatívák

| Alternatíva | Leírás | Miért nem ezt választottuk |
|---|---|---|
| **Alkalmazásszintű ellenőrzés** | `SELECT`, majd `INSERT` zárolás nélkül | Versenyhelyzet miatt párhuzamos kéréseknél dupla foglalás jöhet létre, így nem teljesíti az AC-05.2-t. |
| **Pesszimista zárolás a termen** | A terem sorának zárolása (`SELECT … FOR UPDATE`) minden foglalás előtt | Helyes, de minden olyan kódútvonalon alkalmazni kell, amely foglalást hoz létre, és egy kihagyott hely csendes hibát okoz. Ráadásul egy terem összes foglalását sorba rendezi. |
| **`SERIALIZABLE` tranzakciós szint** | Az adatbázis észleli az ütköző tranzakciókat | Helyes, de terhelés alatt gyakori sorosítási hibákat és újrapróbálkozásokat okoz, ami bonyolítja a kódot és rontja a válaszidőt (NFR-02). |
| **Diszkrét idősáv-tábla egyedi kulccsal** | Pl. 30 perces slotok, `UNIQUE (room_id, slot_start)` | Bármely adatbázison működik, de rögzíti a foglalási egységet, és egy 3 órás foglalás 6 sort jelent. A szabadon választható időtartamot nem kezeli jól. |
| **Elosztott zár (pl. Redis)** | Zár kérése teremenként a foglalás előtt | Újabb infrastruktúra-komponens, amely ráadásul hibapont is (NFR-05), és az adatbázis önmagában sem védi az adatok konzisztenciáját. |

## Következmények

### Pozitív

- Az átfedő foglalások kizárása **minden kódútvonalon garantált**, az adminisztrátori műveletekre és a közvetlen adatbázis-módosításokra is.
- A szabály deklaratív, egy helyen van, és az adatbázis-sémából olvasható.
- A GiST index egyben a foglaltsági lekérdezéseket is gyorsítja (például a heti naptárnézetet, AC-04.1), ami segíti az NFR-01 teljesítését.
- Nincs szükség extra infrastruktúrára vagy újrapróbálkozási logikára.

### Negatív / kockázatok

- **PostgreSQL-függőség:** az `EXCLUDE` megkötés és a `tstzrange` típus PostgreSQL-specifikus, így az adatbázismotor cseréje a megoldás újratervezését igényelné.
- Szükség van a `btree_gist` kiterjesztésre, amelyet az első migrációnak kell telepítenie.
- Az integrációs tesztek **valódi PostgreSQL-t** igényelnek (pl. Testcontainers vagy `docker compose`), mert SQLite-tal vagy H2-vel nem szimulálható ez a viselkedés.
- A fejlesztőknek a `23P01` hibakódot tartományi hibává kell alakítaniuk. Ha ez elmarad, a felhasználó általános 500-as hibát kap.

## Ellenőrzés

- **Integrációs teszt:** N párhuzamos kérés ugyanarra a teremre és idősávra pontosan 1 sikeres foglalást és N−1 db 409-es választ eredményez.
- **Határeset-tesztek:** a szomszédos idősávok (pl. 10–11 és 11–12) foglalhatók, egy lemondott foglalás idősávja újra foglalható, a 3 óránál hosszabb foglalást pedig a rendszer elutasítja.
- **Terheléses teszt:** az NFR-02 k6-tesztjében egy forgatókönyv ugyanazokra a népszerű idősávokra küld kéréseket, és az eredmény után ellenőrizzük, hogy az adatbázisban nincs átfedő aktív foglalás.
