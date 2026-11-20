# ADR-0003: Bejelentkezés SAML2-vel az eduID.hu föderáción keresztül

| | |
|---|---|
| **Állapot** | Elfogadott |
| **Dátum** | 2026-11-20 |
| **Érintett követelmények** | FR-01, FR-02, FR-09, NFR-03, NFR-04 |
| **Felváltja** | Az FR-01 (regisztráció) és az FR-02 (jelszavas bejelentkezés) eredeti megoldását |

---

## Kontextus

Az eredeti követelmények saját regisztrációt írtak elő egyetemi e-mail-címmel, jelszóval és e-mailes megerősítéssel (FR-01), valamint jelszavas bejelentkezést zárolással (FR-02). A csapat döntése, hogy a bejelentkezés az egyetem meglévő azonosítási rendszerével, **SAML2-vel az eduID.hu föderáción keresztül** történjen.

Az eduID.hu a magyar felsőoktatási és kutatói föderáció: az intézmények identitásszolgáltatói (IdP) SAML2-vel azonosítják a felhasználókat a regisztrált szolgáltatások (SP) felé, és szabványos attribútumokat adnak át (eduPerson séma).

## Döntés

A StudyRoom **SAML2 Service Provider** lesz (Web Browser SSO profil, HTTP-Redirect kérés, HTTP-POST válasz).

- **Felhasználó azonosítása:** `eduPersonPrincipalName` (eppn, `urn:oid:1.3.6.1.4.1.5923.1.1.1.6`). Kiegészítő attribútumok: `mail`, `displayName` (vagy `cn`, `sn` + `givenName`).
- **Ki léphet be:** csak akinek az eppn-je engedélyezett scope-ra végződik (`ALLOWED_SCOPES`, alapból `nye.hu` és aldomainjei). Ez váltja ki az AC-01.2 „csak egyetemi e-mail-cím” szabályát.
- **Felhasználói fiók:** első belépéskor automatikusan létrejön, későbbi belépéskor frissül (név, e-mail). Külön regisztráció és e-mailes megerősítés nincs.
- **Szerepkör:** adminisztrátor az, akinek az eppn-je szerepel az `ADMIN_EPPNS` listában; mindenki más hallgató. (Később kiváltható `eduPersonEntitlement` alapú jogosultsággal.)
- **Bizalom:** az IdP aláíró tanúsítványát és SSO-címét konfigurációban rögzítjük (`SAML_IDP_CERT_FILE`, `SAML_IDP_SSO_URL`), az értékek az eduID föderációs metaadatából származnak. Az assertion aláírása kötelező, az audience és az IdP-kibocsátó ellenőrzött.
- **Kijelentkezés:** helyi kijelentkezés (a munkamenet törlődik, AC-02.4). Single Logout (SLO) egyelőre nincs.
- **SP-metaadata:** `GET /saml/metadata`; ezzel kell az SP-t regisztrálni a föderációba.
- **Fejlesztés és CI:** a docker compose egy SimpleSAMLphp teszt-IdP-t indít (`dev/idp/`), amely eduID-szerű, `urn:oid` nevű attribútumokat ad át.

## A követelmények változása

| Követelmény | Változás |
|---|---|
| FR-01 Regisztráció | Megszűnik a külön regisztráció; a fiók az első eduID-belépéskor jön létre. AC-01.2 helyett: más intézmény felhasználóját a rendszer elutasítja. AC-01.3 tárgytalan. |
| FR-02 Bejelentkezés | A jelszót az IdP kéri be. AC-02.2 és AC-02.3 (hibaüzenet, zárolás) az IdP felelőssége. AC-02.1 és AC-02.4 változatlan. |
| NFR-03 Jelszavak | A StudyRoom nem tárol jelszót. A HTTPS (TLS 1.2+) követelmény változatlan. |
| Osztálydiagram | A Felhasználó osztályból kikerül a `jelszóHash`, `megerősítve`, `sikertelenBelépések`, `zárolvaEddig`; bekerül az `eppn`. |
| Prototípus, user flow | A K-02 – K-04 (regisztráció, bejelentkezés) képernyők helyére az eduID-s belépés lép (UF-01). |

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| **Saját jelszavas regisztráció (eredeti terv)** | Újabb jelszó a hallgatóknak, jelszókezelési és -tárolási felelősség (NFR-03), zárolás és jelszó-visszaállítás megvalósítása. Az egyetemi azonosítás mindezt kiváltja. |
| **OpenID Connect** | Modernebb protokoll, de az eduID.hu föderáció elsődlegesen SAML2-t használ. |
| **Shibboleth SP (mod_shib) fordított proxyként** | Bevett megoldás, de újabb konténer és Apache-konfiguráció; a Node.js-es SAML-könyvtár egyszerűbb, és tesztelhető. |
| **Közvetlen LDAP az egyetemi címtárhoz** | Az alkalmazás kezelné a jelszavakat; nem föderatív, és jogosultságot is kellene kérni a címtárhoz. |

## Következmények

### Pozitív

- Nincs jelszó a rendszerben: kevesebb kód, kisebb támadási felület, egyszerűbb GDPR-megfelelés (NFR-04).
- A hallgatók a megszokott egyetemi belépéssel jutnak be (NFR-07 használhatóság).

### Negatív / kockázatok

- **Föderációs regisztráció szükséges:** az éles SP-t a föderáció üzemeltetőjénél regisztrálni kell az SP-metaadatokkal, és az IdP-nek ki kell adnia a szükséges attribútumokat (eppn, mail, displayName). A pontos eljárást az egyetem informatikájával és az eduID.hu üzemeltetőjével egyeztetni kell.
- **Tanúsítványcsere:** ha az IdP aláíró tanúsítványa változik, a konfigurációt frissíteni kell; az átmenethez a `SAML_IDP_CERT` több tanúsítványt is fogadhat a jövőben.
- **SLO hiánya:** a StudyRoomból kilépve az IdP-munkamenet megmarad; közös gépen a böngésző bezárása ajánlott.
- **Fejlesztői IdP:** a teszt-IdP tanúsítványa nyilvános, csak helyi és CI-környezetben használható.
