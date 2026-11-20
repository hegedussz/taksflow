# ADR-0002: Technológiai stack

| | |
|---|---|
| **Állapot** | Elfogadott |
| **Dátum** | 2026-11-20 |
| **Érintett követelmények** | NFR-01, NFR-02, NFR-07, NFR-08, ADR-0001, ADR-0003 |

---

## Kontextus

A README eddig nyitva hagyta a stack kérdését; rögzítve csak a PostgreSQL (ADR-0001) és a Docker-alapú futtatás (NFR-08) volt. A fejlesztés indulásához el kell dönteni a nyelvet, a webes keretrendszert, a felület megvalósítását és a tesztelés eszközeit.

Szempontok:

- A bejelentkezés SAML2-vel, eduID-n keresztül történik (ADR-0003). A SAML böngészős átirányításokra és munkamenet-sütire épül, ezért a szerveroldali munkamenet a természetes megoldás.
- A felületnek kétnyelvűnek (NFR-07), akadálymentesnek (WCAG 2.1 AA) és 360 px-től reszponzívnak (NFR-08) kell lennie, és gyorsan kell betöltődnie (NFR-01).
- Az ütközéskezelés PostgreSQL-specifikus (`tstzrange`, `EXCLUDE`), ezért olyan adatbázis-elérés kell, amely a nyers SQL-t is kényelmesen kezeli.
- Kis csapat, egyetlen nyelv a teljes alkalmazásban.

## Döntés

| Terület | Választás |
|---|---|
| Nyelv, futtatókörnyezet | **TypeScript**, **Node.js 22 LTS** |
| Webes keretrendszer | **Express 4** |
| Felület | **Szerveroldali renderelés Nunjucks-sablonokkal**, minimális progresszív JavaScripttel |
| Adatbázis-elérés | **node-postgres (`pg`)**, paraméterezett nyers SQL, saját SQL-migrációk (`migrations/`) |
| Bejelentkezés | **@node-saml/passport-saml** (ADR-0003) |
| Munkamenet | `express-session`, PostgreSQL-ben tárolva (`connect-pg-simple`) |
| Levélküldés | `nodemailer` (SMTP); fejlesztéskor Mailpit |
| Tesztelés | **Vitest** + **Supertest**; integrációs tesztek valódi PostgreSQL-lel |
| Minőség | ESLint (typescript-eslint), `tsc --noEmit` |
| Futtatás | Többlépcsős **Docker**-image, **docker compose** (app, db, teszt-IdP, Mailpit) |
| CI/CD | **GitHub Actions**: lint → tesztek → compose E2E → image a GHCR-be |

A domain-szabályok (`src/domain/`) a keretrendszertől függetlenek, a szolgáltatások (`src/services/`) az osztálydiagram service-eit követik (TeremService → `RoomService`, FoglalásService → `BookingService`, ÉrtesítésService → `NotificationService`, ÜtemezettFeladatok → `src/jobs/`).

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| **Java / Spring Boot + Thymeleaf** | Kiforrott SAML-támogatás (Spring Security SAML2), de nagyobb memóriaigény és lassabb fejlesztési ciklus. A csapat egyetlen nyelvvel (TypeScript) dolgozhat front- és backend-feladatokon is. |
| **SPA (React) + REST API** | A SAML-lel külön tokenkezelés kellene a böngészőben; több kód, nagyobb első betöltés (NFR-01), és az akadálymentességet nehezebb biztosítani. A JSON API ettől függetlenül elérhető a `/api` alatt (szekvenciadiagram). |
| **ORM (Prisma, TypeORM)** | A `tstzrange` és az `EXCLUDE` megkötés nem modellezhető bennük természetesen; a nyers SQL itt átláthatóbb. |
| **Python / Django** | Jó választás lett volna, de a SAML-integrációja (pysaml2) körülményesebb, és a csapat a JavaScript-ökoszisztémában otthonosabb. |

## Következmények

### Pozitív

- Egyetlen nyelv; a típusellenőrzés a fordítási kulcsok teljességét is ellenőrzi (`src/web/locales/en.ts` típusa a magyarból készül).
- Kis futási memóriaigény, gyors indulás a konténerben.
- A szerveroldali renderelés JavaScript nélkül is működő, akadálymentes űrlapokat ad.

### Negatív / kockázatok

- Express 4 a Promise-hibákat nem kezeli magától; minden aszinkron kezelőt az `ah()` segédfüggvénnyel kell becsomagolni.
- A sablonokat a TypeScript nem ellenőrzi; ezt a HTTP-szintű integrációs tesztek fedik le.
