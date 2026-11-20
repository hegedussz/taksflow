# StudyRoom

Vizsgaidőszakban szinte lehetetlen szabad tanulószobát találni a campuson: az ember végigjárja az épületeket, és jó esetben a harmadik helyen talál egy üres asztalt. A **StudyRoom** ezen szeretne segíteni. Egy egyszerű webes felületen a hallgatók előre megnézhetik, melyik terem mikor szabad, és le is foglalhatják maguknak. Az adminisztrátorok ugyanitt kezelik a termeket, és statisztikákból látják, mennyire vannak kihasználva.

> **A fejlesztés elkezdődött.** Működik az eduID-s (SAML2) bejelentkezés, a termek böngészése, a heti naptár, a foglalás és a lemondás, a saját foglalások, az emlékeztetők és a teremkezelés. Működik a kihasználtsági statisztika és a CSV-export is. Hátravan a fióktörlés (NFR-04).

## Mit tud majd az alkalmazás?

**Hallgatóként**
- az egyetemi eduID-fiókoddal lépsz be, külön regisztráció nélkül;
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
| [ADR-0002](docs/architecture/adr/0002-technologiai-stack.md) | Technológiai stack |
| [ADR-0003](docs/architecture/adr/0003-bejelentkezes-saml2-eduid.md) | Bejelentkezés SAML2-vel az eduID.hu föderáción keresztül |
| [Felhasználói folyamatok](docs/ux/felhasznaloi-folyamatok.md) | A fő tevékenységek lépésről lépésre (user flow), képernyőlistával |
| [Prototípus](docs/ux/prototipus.html) | Kattintható prototípus mockup és wireframe nézettel, böngészőben megnyitható |

A diagramok forrásfájljai (`.drawio`) a képek mellett találhatók, és a [draw.io](https://app.diagrams.net) programmal szerkeszthetők.

## Technikai keretek

- **Stack:** TypeScript, Node.js 22, Express, szerveroldali renderelés (Nunjucks), PostgreSQL 16 ([ADR-0002](docs/architecture/adr/0002-technologiai-stack.md)).
- **Bejelentkezés:** SAML2, eduID.hu föderáció; csak `nye.hu` scope-ú felhasználók léphetnek be ([ADR-0003](docs/architecture/adr/0003-bejelentkezes-saml2-eduid.md)).
- **Ütközéskezelés:** az átfedő foglalásokat adatbázis-szintű kizárási megkötés zárja ki ([ADR-0001](docs/architecture/adr/0001-foglalasi-utkozesek-kezelese.md)).
- **Futtatás:** a teljes rendszer Docker-konténerekben fut, és egyetlen paranccsal elindítható.
- **Felület:** reszponzív, magyar és angol nyelvű, a WCAG 2.1 AA szintet célozza.

## Futtatás fejlesztői gépen

Előfeltétel: Docker és Docker Compose.

```bash
docker compose up --build
```

| Szolgáltatás | Cím | Megjegyzés |
|---|---|---|
| StudyRoom | http://localhost:3000 | demóadatokkal |
| Teszt-IdP (eduID helyett) | http://localhost:8080 | SimpleSAMLphp |
| Kimenő e-mailek | http://localhost:8025 | Mailpit |

Teszt-felhasználók a „Belépés eduID-val” gomb után (jelszó mindegyiknél `password`):

| Felhasználó | Szerepkör |
|---|---|
| `hallgato1`, `hallgato2` | hallgató |
| `admin1` | adminisztrátor |
| `kulsos` | más intézmény, a belépést a rendszer elutasítja |

Az éles beállításokhoz lásd a [.env.example](.env.example) fájlt.

## Fejlesztés és tesztelés

Node.js 22 és egy PostgreSQL-adatbázis kell a tesztekhez:

```bash
npm ci
docker run -d --name studyroom-testdb -p 55432:5432 \
  -e POSTGRES_USER=studyroom -e POSTGRES_PASSWORD=studyroom -e POSTGRES_DB=studyroom_test postgres:16-alpine

npm run lint              # ESLint
npm run typecheck         # TypeScript
npm test                  # összes teszt
npm run test:unit         # csak egységtesztek (adatbázis nélkül)
npm run test:integration  # integrációs tesztek valódi PostgreSQL-lel
npx vitest run test/unit/rules.test.ts -t "3 óra"   # egyetlen teszt
python3 scripts/e2e_saml_login.py   # E2E: SAML-belépés + foglalás a futó docker compose ellen
```

A tesztadatbázis címét a `TEST_DATABASE_URL` változóval lehet módosítani.

## CI/CD

A [GitHub Actions workflow](.github/workflows/ci.yml) minden pushra és pull requestre lefut:

1. **test:** lint, típusellenőrzés, egység- és integrációs tesztek PostgreSQL-szolgáltatással, build;
2. **e2e:** a teljes `docker compose` rendszer indítása, majd valódi SAML-bejelentkezés, foglalás és e-mail-ellenőrzés;
3. **image:** Docker-image építése; a `main` ágon a GitHub Container Registrybe is feltölti (`ghcr.io/hegedussz/taksflow`).

## A repó felépítése

```
.
├── src/
│   ├── domain/         # üzleti szabályok és hibák (keretrendszer-független)
│   ├── services/       # TeremService, FoglalásService, ÉrtesítésService
│   ├── jobs/           # ütemezett feladatok (emlékeztetők)
│   ├── auth/           # SAML2 / eduID, jogosultság-ellenőrzés
│   ├── db/             # kapcsolat, migrációfuttató
│   └── web/            # útvonalak, naptár, fordítások (hu, en)
├── views/              # Nunjucks-sablonok
├── public/             # CSS, JS
├── migrations/         # SQL-migrációk
├── seeds/              # demóadatok
├── test/               # egység- és integrációs tesztek
├── dev/idp/            # fejlesztői SAML IdP beállításai
├── scripts/            # E2E-próba
├── docs/               # követelmények, architektúra, ADR-ek, UX
├── Dockerfile
└── docker-compose.yml
```

## Csapat

A nem funkcionális követelményeket felosztottuk egymás között. Mindenki két területért felel:

| Terület | Követelmények |
|---|---|
| Teljesítmény | NFR-01, NFR-02 |
| Biztonság | NFR-03, NFR-04 |
| Megbízhatóság | NFR-05, NFR-06 |
| Használhatóság és hordozhatóság | NFR-07, NFR-08 |
