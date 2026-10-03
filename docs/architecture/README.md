# Architektúra – StudyRoom

A diagramok forrása a `.drawio` fájl, amely a [draw.io](https://app.diagrams.net) programmal szerkeszthető. Módosítás után a `.png` változatot is újra kell exportálni (*Fájl → Exportálás → PNG*).

| Diagram | Forrás | Kép | Tartalom |
|---|---|---|---|
| Használatieset-diagram | [hasznalati-eset-diagram.drawio](hasznalati-eset-diagram.drawio) | [PNG](hasznalati-eset-diagram.png) | Szereplők (Vendég, Felhasználó, Hallgató, Adminisztrátor, Ütemező, E-mail szolgáltatás), valamint az FR-01 – FR-10 és az NFR-04 használati esetei, `«include»` / `«extend»` kapcsolatokkal |
| Szekvenciadiagram | [szekvenciadiagram-foglalas.drawio](szekvenciadiagram-foglalas.drawio) | [PNG](szekvenciadiagram-foglalas.png) | Foglalás létrehozása (FR-05): validálás, felhasználónkénti korlát (AC-05.4), ütközéskezelés a kizárási megkötéssel (AC-05.2, [ADR-0001](adr/0001-foglalasi-utkozesek-kezelese.md)) |
| Osztálydiagram | [osztalydiagram.drawio](osztalydiagram.drawio) | [PNG](osztalydiagram.png) | Tartománymodell (Épület, Terem, Felszereltség, Nyitvatartás, Foglalás, Felhasználó, felsorolások) és a szolgáltatási réteg (service-ek, ütemezett feladatok) |

## Döntési jegyzőkönyvek (ADR)

| Azonosító | Cím | Állapot |
|---|---|---|
| [ADR-0001](adr/0001-foglalasi-utkozesek-kezelese.md) | Foglalási ütközések megakadályozása adatbázis-szintű kizárási megkötéssel | Javasolt |
