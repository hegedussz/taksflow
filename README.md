# StudyRoom

Vizsgaidőszakban szinte lehetetlen szabad tanulószobát találni a campuson: az ember végigjárja az épületeket, és jó esetben a harmadik helyen talál egy üres asztalt. A **StudyRoom** ezen szeretne segíteni. Egy egyszerű webes felületen a hallgatók előre megnézhetik, melyik terem mikor szabad, és le is foglalhatják maguknak. Az adminisztrátorok ugyanitt kezelik a termeket, és statisztikákból látják, mennyire vannak kihasználva.

> **A projekt jelenleg tervezési fázisban van.** Elkészültek a követelmények, az UML-diagramok és az első architekturális döntés. A fejlesztés ezekre épül.

## Mit tud majd az alkalmazás?

**Hallgatóként**
- regisztrálhatsz az egyetemi e-mail-címeddel (`@*.nye.hu`);
- böngészheted a termeket, és szűrhetsz épületre, férőhelyre vagy felszereltségre (projektor, tábla stb.);
- heti naptárnézetben láthatod, mikor szabad egy terem;
- legfeljebb 3 órára foglalhatsz, és egyszerre legfeljebb 2 aktív foglalásod lehet;
- lemondhatod a foglalásodat, hogy más is használhassa a termet;
- a kezdés előtt 30 perccel emlékeztető e-mailt kapsz (ha nem kéred, kikapcsolhatod).

**Adminisztrátorként**
- létrehozhatod, szerkesztheted és inaktiválhatod a termeket;
- megnézheted a termek kihasználtságát egy adott időszakra, és CSV-be exportálhatod.

A teljes, elfogadási kritériumokkal kiegészített leírás a [követelménydokumentumban](docs/requirements.md) található.

## Dokumentáció

| Dokumentum | Leírás |
|---|---|
| [Követelmények](docs/requirements.md) | Szerepkörök, 10 funkcionális és 8 nem funkcionális követelmény |
| [Architektúra](docs/architecture/README.md) | Az UML-diagramok áttekintése |
| [Használatieset-diagram](docs/architecture/hasznalati-eset-diagram.png) | Ki mit tehet a rendszerben |
| [Szekvenciadiagram](docs/architecture/szekvenciadiagram-foglalas.png) | Mi történik a háttérben egy foglaláskor |
| [Osztálydiagram](docs/architecture/osztalydiagram.png) | Tartománymodell és szolgáltatási réteg |
| [ADR-0001](docs/architecture/adr/0001-foglalasi-utkozesek-kezelese.md) | Hogyan akadályozzuk meg, hogy ketten ugyanazt az idősávot foglalják le |

A diagramok forrásfájljai (`.drawio`) a képek mellett találhatók, és a [draw.io](https://app.diagrams.net) programmal szerkeszthetők.

## Tervezett technikai keretek

A technológiai stack még nincs véglegesítve. Amit eddig rögzítettünk:

- **Adatbázis:** PostgreSQL. Az ütköző foglalásokat adatbázis-szintű megkötés zárja ki (lásd [ADR-0001](docs/architecture/adr/0001-foglalasi-utkozesek-kezelese.md)).
- **Futtatás:** a teljes rendszer Docker-konténerekben fut, és egyetlen `docker compose up` paranccsal elindítható.
- **Felület:** reszponzív webalkalmazás magyar és angol nyelven, a WCAG 2.1 AA akadálymentességi szintnek megfelelően.
- **Biztonság:** HTTPS, a jelszavakat bcrypt vagy Argon2id algoritmussal tároljuk, és az adatkezelés GDPR-kompatibilis.

## A repó felépítése

```
.
├── docs/
│   ├── requirements.md          # követelményspecifikáció
│   └── architecture/
│       ├── README.md            # a diagramok áttekintése
│       ├── *.drawio / *.png     # UML-diagramok
│       └── adr/                 # architekturális döntések
└── README.md
```

## Csapat

A nem funkcionális követelményeket felosztottuk egymás között. Mindenki két területért felel:

| Terület | Követelmények |
|---|---|
| Teljesítmény | NFR-01, NFR-02 |
| Biztonság | NFR-03, NFR-04 |
| Megbízhatóság | NFR-05, NFR-06 |
| Használhatóság és hordozhatóság | NFR-07, NFR-08 |
