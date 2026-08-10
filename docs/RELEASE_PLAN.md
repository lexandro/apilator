# Apilator — kiadás-előkészítési terv és napló

> Az `2026-08-10`-i kódátvizsgálás alapján. Ez a dokumentum egyszerre terv és napló:
> a fázisok sorrendje előre rögzített, a lépések részletes bontása mindig az adott
> fázis elején készül el, és a fázis végén ide kerül, mi lett belőle.

## Döntések

Ezek a felhasználó explicit döntései, nem feltételezések:

| Kérdés | Döntés |
|--------|--------|
| Halott UI (General settings, JWT) | General beállítások teljes bekötése; JWT **csak HMAC** (HS256/384/512), az RS/ES/PS algoritmusok kikerülnek a listából, mert azokhoz privát kulcs input kellene |
| Licenc | **MIT** |
| TLS-tanúsítvány ellenőrzés | Alapértelmezésben **bekapcsolva**, Settingsben kikapcsolható, kikapcsolt állapot láthatóan jelezve |
| Git | **Minden GitLabra** (`gitlab.com/lexandro2000/apilator`). GitHub/winget/chocolatey egyelőre nincs napirenden — külön szólásra. Ezért a CI is **GitLab CI**. |
| Form Data | Szöveges mezők **és fájlfeltöltés** — teljes `multipart/form-data` |
| Collections | Fa szerkezet: collection > mappa > kérés, drag & droppal, **külön fájlba** mentve |
| Környezetek | Több környezet, változónként **titkosnak jelölhető** — a titkosak a Credential Managerbe |
| Import/export | Saját collection formátum **és OpenAPI 3 import**. curl és Postman nem kell. |

## Fázisok

A sorrend függőségi, nem fontossági: minden fázis olyan alapot rak le, amire a következő épít.
A korai fázisokban a kevés munkával sokat nyerő és a visszafordíthatatlan kárt megelőző
tételek vannak előre húzva.

| # | Fázis | Fedett találatok | Állapot |
|---|-------|------------------|---------|
| 0 | Tesztinfrastruktúra és minőségi kapuk | — | ✅ kész |
| 1 | Adatvesztés megszüntetése | B4, B5, B9 | ✅ kész |
| 2 | Biztonság | B1, B6, B7 | ✅ kész |
| 3 | Perzisztencia és memória | P5, M1 | ✅ kész |
| 4 | Nézet-teljesítmény | P1, P2, P3 | ✅ kész |
| 5 | Hálózati réteg | P4, M2, B8 | ✅ kész |
| 6 | Halott UI bekötése | B2, B3 | ✅ kész |
| 7 | Struktúra és réteghatárok | S1, S2, S3 + import-sértések | ✅ kész |
| 8 | Repó-higiénia | LICENSE, képek, README | ✅ kész |
| 9 | Blokkolók a második átnézésből | B10, B11, B12, B13 | ✅ kész |
| 10 | Tesztlefedettség: hookok és nézetek | — | ✅ kész |
| 11 | Collections | funkció | ✅ kész |
| 12 | Környezetek és változók | funkció | ✅ kész |
| 13 | Import/export | funkció | ✅ kész |
| 14 | Kiadás-előkészítés | CHANGELOG, CONTRIBUTING, SECURITY, verzió | ✅ kész |

Jelölések: ⬜ nem kezdődött el · 🟡 folyamatban · ✅ kész · ⏸️ blokkolt

### Összesítés — mind a kilenc fázis kész

| Kapu | Induláskor | Most |
|------|-----------|------|
| frontend teszt | **0** (exit 1) | **228** |
| Rust teszt | **0** | **59** (+5 hálózatfüggő) |
| `bun run lint` | **nem futott** (nincs config) | tiszta, réteghatárokat is őrzi |
| `bunx tsc --noEmit` | tiszta | tiszta |
| `cargo clippy -D warnings` | nem volt kapu | tiszta |
| CI | **nincs** | 9 pipeline, mind zöld |

**Mért javulások**

| | Előtte | Utána |
|--|--------|-------|
| state fájl mentése (50 előzmény, 1 MB-os válaszok) | 86,0 MB / 1 041 ms | 7 kB / 5 ms |
| előzmény memóriában (50 × 1 MB válasz) | 60,8 MB | 1,2 MB |
| valódi state fájl a gépen | 5 652 kB | 36 kB |
| keresés 6,2 MB-os válaszban | 3 376 ms | 13,4 ms |
| sorkezdetek görgetéskor (frame) | 19,3 ms | 0,004 ms |
| hex nézet 6,2 MB-on | 3 284 ms | 206 ms |
| `dist/` méret | 3,9 MB | 820 kB |
| kapcsolat-újrahasználat | nincs (kérésenként új TLS) | kliens-cache |

**Lezárt találatok:** B1–B9, P1–P5, M1–M2, S1–S3, és a repó-higiéniai tételek.
Kettő a review-ban tévesen volt megfogalmazva; a pontosítás a 6. és 7. fázis naplójában.


### Fázisonkénti munkamenet

Minden fázis ugyanazt a ciklust futja:

1. **Terv** — a lépések részletes bontása ebbe a dokumentumba, a fázis szakaszába.
2. **Kivitelezés** — a lépések végrehajtása.
3. **Ellenőrzés** — `bunx tsc --noEmit`, `bun run lint`, `bun run test`, `cargo clippy`, `cargo test`.
4. **Jövőállóvá tétel** — automatikus teszt minden javított hibára, hogy ne jöjjön vissza.
5. **Napló** — mi készült el, mi derült ki közben, mi maradt nyitva.
6. **Commit + push** a GitLab originre, majd a következő fázis.

---

## Fázis 0 — Tesztinfrastruktúra és minőségi kapuk

**Cél:** legyen mivel bizonyítani, hogy a további fázisok javítanak és nem rontanak.
Ez azért az első, mert enélkül minden utána következő változtatás vakon történne.

**Kiindulási állapot (mért):**
- `bun run test` → `No test files found, exiting with code 1` — nulla tesztfájl
- `bun run lint` → `ESLint couldn't find a configuration file` — a lint még soha nem futott
- `bunx tsc --noEmit` → tiszta
- `cargo clippy` → 0 warning
- CI: nincs

**Státusz:** ✅ kész

### Lépések

- [x] 0.1 Vitest konfiguráció (node környezet; DOM-igényes teszt majd fájlonként `@vitest-environment jsdom`-mal)
- [x] 0.2 ESLint 9 + flat config, typescript-eslint és react-hooks pluginnal
- [x] 0.3 `react-hooks/exhaustive-deps` bekapcsolása — ez fogta volna meg az S1 hibát
- [x] 0.4 Első tesztek a tiszta függvényekre: `utils/formatters`, `utils/searchHighlight`
- [x] 0.5 Tesztek a `tabsStore` műveleteire a store publikus felületén át
- [x] 0.6 Tesztek a `httpService` auth helpereire és a kérésösszeállításra
- [x] 0.7 Rust teszt-modul felállítása, `cargo test` zölden fusson
- [x] 0.8 `.gitlab-ci.yml`: tsc + lint + vitest + build + clippy + cargo test
- [x] 0.9 `package.json` scriptek rendbetétele (`typecheck`, `check`, `test:watch`, `test:coverage`)

Menet közben hozzájött:

- [x] 0.10 Magyar kommentek eltávolítása a teljes kódbázisból (új szabály: a kód angol, komment csak ott, ahol nem triviálisan újralevezethető)
- [x] 0.11 `Cargo.lock` verziókövetésbe véve — előrehozva a 8. fázisból, mert a CI cache-kulcs és a reprodukálható build ettől függ
- [x] 0.12 Dead code törlése és duplikáció összevonása a keresési útvonalon

### Eredmény

| Kapu | Előtte | Utána |
|------|--------|-------|
| `bun run typecheck` | tiszta | tiszta |
| `bun run lint` | **nem futott** (nincs config) | tiszta |
| `bun run test` | **0 teszt**, exit 1 | **103 teszt**, zöld |
| `cargo clippy -D warnings` | nem volt kapu | tiszta |
| `cargo test` | **0 teszt** | **5 teszt**, zöld |
| CI | **nincs** | `.gitlab-ci.yml`, 2 job |

### Napló

**Tesztlefedettség indulásnak.** 103 frontend teszt négy fájlban: `formatters` (25),
`searchHighlight` (14), `tabsStore` (30), `httpService` (34). Mind a tiszta, determinisztikus
felületeket célozza — nincs benne DOM-renderelés, ezért gyors (a teljes futás ~1 s).

**Két ismert hiba tesztbe zárva.** A B2 és B3 találat nem tűnt el, csak most már a teszt-suite
őrzi őket:

- `KNOWN BUG (B3)` — `it.fails`-szel. Addig zöld, amíg a `hasAuthHeader` és a
  `computeAuthHeader` ellentmond egymásnak JWT-nél. Amikor a 6. fázis megjavítja, ez a teszt
  pirosra vált, és sima `it`-re kell cserélni. Így a javítás nem maradhat észrevétlen.
- `KNOWN BUG (B2)` — sima assert arra, hogy a timeout beégetett 30000. A 6. fázisban ez
  elhasal, és a beállított értéket ellenőrző tesztre kell cserélni.

**Dead code, amit a tesztírás hozott elő.** Tesztet akartam írni a `searchHighlight.ts`-re, és
kiderült, hogy a modul nagy része halott: az `escapeHtml` és a `highlightMatches` sehol nincs
használva, a `findMatches` pedig duplikálva volt a `useSearchHighlight`-ban
(`findMatchesOptimized` néven, egyetlen különbséggel: volt rajta egy 10000-es találat-limit).
Emellett a teljes `HighlightedCode.tsx` komponens és a `getNormalizedQueryLength` is
használatlan volt, és a `useSearchHighlight` `contentRef`-je sem volt sehova bekötve, így az
arra épülő scroll-effekt sosem csinált semmit.

Ezeket töröltem, a két `findMatches` implementációt pedig egybe vontam (a limit megmaradt,
`DEFAULT_MAX_MATCHES` néven, alapértelmezett paraméterként). Így a tesztek élő kódot fednek,
és a 4. fázisnak egy implementációt kell optimalizálnia kettő helyett.

A `normalizeString` diakritika-szűrő regexét `\p{Mn}` Unicode property escape-re cseréltem a
korábbi `[̀-ͯ]` tartomány helyett. Ok: a tartomány láthatatlan kombináló karakterekként
került a forrásba, ami törékeny; a property escape ráadásul a Latin blokkon kívüli diakritikákat
is kezeli. A fájl most tiszta ASCII, ezt byte-szinten ellenőriztem.

**Nyelvi és komment-szabály.** A fázis közben jött a szabály, hogy a kód angol és a kommentek
csak nekem szólnak. Visszamenőleg alkalmaztam: 19 fájlból tűntek el magyar JSDoc blokkok,
amik kivétel nélkül a függvény nevét ismételték (`Hook a tab drag & drop kezelésére` a
`useTabDrag` fölött). A tesztadatokban lévő magyar stringek is angolra cserélődtek — kivéve
ahol maga a magyar szöveg a teszt tárgya (`normalizeString('Árvíztűrő tükörfúrógép')`).

**CI.** Két job: a `frontend` bun image-en typecheck + lint + teszt + build, a `rust`
Debian-alapú rust image-en clippy (`-D warnings`) + cargo test. A rust job telepíti a Tauri
Linux build-függőségeit — ez lassú lesz, de a cache a `Cargo.lock`-ra kulcsolódik. **Nyitott
kérdés:** nem tudom, van-e a projekthez konfigurált GitLab runner és elég CI-perc. Ha az első
pipeline nem indul el, az ott fog kiderülni.

---

## Fázis 1 — Adatvesztés megszüntetése

**Cél:** a mentett állapot semmilyen körülmények között ne tűnhessen el némán. Ez azért
előzi meg a teljesítményt és a biztonságot, mert ezek a hibák kiadás után visszamenőleg
nem javíthatók: akinek egyszer elveszett az adata, annak elveszett.

**Fedett találatok:** B4 (verzióeltérésnél néma törlés), B5 (nem atomi írás), és egy
menet közben talált harmadik, ami a review-ban nem szerepelt:

**B9 — a hibás state örökre a splash képernyőn ragasztja az appot.** Az `App.tsx`
betöltő effektjén nincs `.catch()`:

```ts
persistenceService.loadAppState().then((state) => {
  if (state) {
    const loadedTabs = persistenceService.stateToTabs(state);  // ha state.tabs hiányzik, ez dob
    ...
  }
  setIsLoading(false);   // ide már nem jut el
});
```

Ha a YAML szintaktikailag érvényes és a verzió is stimmel, de a `tabs` kulcs hiányzik vagy
nem tömb, a `stateToTabs` `TypeError`-t dob, a `setIsLoading(false)` sosem fut le, és az app
véglegesen a splash képernyőn marad — újraindítás sem segít, mert a hibás fájl ott marad.
Ez a B4-gyel együtt különösen csúnya: a felhasználó nem tudja se használni, se megjavítani.

### Lépések

- [x] 1.1 Rust: `save_state` atomi legyen — ideiglenes fájl ugyanabban a könyvtárban, `fsync`, majd `rename`
- [x] 1.2 Rust: a fájlműveletek kiemelése útvonal-paraméteres tiszta függvényekbe, hogy temp könyvtárral tesztelhetők legyenek
- [x] 1.3 Rust: új `backup_state` parancs — a sérült/olvashatatlan fájl átnevezése törlés helyett
- [x] 1.4 Rust tesztek: atomi írás nem hagy `.tmp`-t, félbeszakadt írás nem rontja el a meglévő fájlt, backup működik
- [x] 1.5 TS: migrációs lánc infrastruktúra (`STATE_VERSION`, `MIGRATIONS` map, `migrateState`)
- [x] 1.6 TS: ismeretlen vagy újabb verzió → backup + tiszta indulás, nem néma törlés
- [x] 1.7 TS: alakzat-validáció a betöltött state-en, mielőtt bármi hozzáér
- [x] 1.8 TS: `App.tsx` betöltés hibakezelése — a splash mindig eltűnjön (B9)
- [x] 1.9 Tesztek a teljes betöltési útvonalra: ép, sérült, hiányos, régi és újabb verziójú state

**Státusz:** ✅ kész

### Eredmény

| Kapu | 0. fázis után | 1. fázis után |
|------|---------------|---------------|
| frontend teszt | 103 | **140** |
| Rust teszt | 5 | **16** |
| `tsc` / `lint` / `clippy -D warnings` | tiszta | tiszta |

### Napló

**Atomi írás (B5).** A `save_state` mostantól ideiglenes fájlba ír ugyanabba a könyvtárba,
`sync_all()`-lal kikényszeríti a lemezre írást, majd `fs::rename`-mel a helyére mozgatja.
Windows-on a `std::fs::rename` `MOVEFILE_REPLACE_EXISTING`-gel dolgozik, tehát a meglévő
fájlt felülírja — ezt külön teszt igazolja, nem feltételezés.

A megszakadt írás tesztje nem szimulál: valódi hibát idéz elő azzal, hogy a temp fájl helyére
egy könyvtárat rak, amitől a `File::create` elhasal. A teszt előbb igazolja, hogy az írás
**tényleg** hibát adott (`result.is_err()`), és csak utána ellenőrzi, hogy a régi tartalom
sértetlen. Enélkül a teszt akkor is zöld lenne, ha az írás simán lefutott volna.

**Backup törlés helyett (B4).** Új `backup_state` parancs: a `load_state` útvonalon minden
olyan pont, ahol eddig `return null` volt, most előbb félreteszi a fájlt
`apilator-state.yaml.<suffix>.bak` néven. A suffix a frontendről jön, ezért fájlnévvé
alakítás előtt szűrve van — csak `[A-Za-z0-9_-]` marad belőle, 32 karakterig. Két teszt őrzi:
a `../../escaped` suffix sem tud kilépni az adatkönyvtárból, és üres bemenetre `backup` a
fallback.

**Migrációs lánc (B4).** A `migrateState` a `MIGRATIONS` mapből dolgozik, ami jelenleg üres —
`STATE_VERSION` még 1. A lényeg, hogy az infrastruktúra a helyén van és tesztelve van,
mert a 3. fázis meg fogja változtatni a history alakját, és ott lesz az első valódi migráció.
Két védelem van benne, amit teszt is fed: a lánc megáll, ha egy migráció nem emeli a
verziószámot (különben végtelen ciklus), és elutasítja az újabb verziójú state-et ahelyett,
hogy próbálná értelmezni.

**Alakzat-validáció és javítás.** Eredetileg vak `as AppState` cast volt a betöltésben.
Most valódi szűkítés van, és nem elutasít, hanem javít, ahol tud: hiányzó `headers` tömb,
hiányzó `auth`, hiányzó body-almezők mind alapértékkel töltődnek, így egy részlegesen sérült
tab használható marad ahelyett, hogy elveszne. Amit nem lehet menteni (nincs `request`, vagy
nincs `url`/`method`), az kiesik — de csak az az egy tab, nem az egész állapot.

Menet közben ez egy 6. fázisbeli döntést is előrehozott: a JWT algoritmus betöltéskor a
HS256/384/512 halmazra van szűkítve, mert az aszimmetrikus algoritmusokhoz nem lesz
implementáció. Egy régi state-ben tárolt `RS256` így némán HS256-ra esik vissza ahelyett,
hogy egy aláírhatatlan értéket vinne tovább.

**B9 — a splash képernyős beragadás.** Ez nem volt benne az eredeti review-ban, a fázis
tervezésekor jött elő. Az `App.tsx` betöltő effektjén nem volt `.catch()`, így ha a
`stateToTabs` dobott (pl. hiányzó `tabs` tömb miatt), a `setIsLoading(false)` sosem futott le,
és az app véglegesen a splash képernyőn maradt — újraindítás sem segített, mert a hibás fájl
ott maradt a lemezen. Most `.catch().finally()` van rajta, tehát a splash minden ágon eltűnik.
A hibás fájl pedig a backup-mechanizmus miatt már nem is marad ott.

**CI első futás.** A `frontend` job 37 másodperc alatt zöld. A `rust` job hideg cache-sel
7+ percig futott, mert telepíti a Tauri Linux függőségeit és lefordít ~400 crate-et. Ez
így elfogadható, de figyelni kell a CI-percekre; ha sokat eszik, a rust jobot érdemes lesz
csak a `src-tauri/**` változásaira szűkíteni.

---

## Fázis 2 — Biztonság

**Cél:** a három biztonsági találat lezárása. Ezek olcsók és nagy értékűek, ezért kerültek
előre a teljesítmény elé.

**Fedett találatok:** B1 (TLS-ellenőrzés kikapcsolva), B6 (jelszó plaintextben),
B7 (nincs CSP, globális Tauri API).

**Döntés a B1-hez (a felhasználótól):** az ellenőrzés alapértelmezésben bekapcsolva,
Settingsben kikapcsolható, és kikapcsolt állapotban a UI láthatóan jelzi.

**Döntés a B6-hoz (saját, indoklással):** a jelszavak a Windows Credential Managerbe
kerülnek a `keyring` crate-tel. A két alternatíva rosszabb volt: a "ne perzisztáljuk"
azt jelentené, hogy minden indításnál újra be kell gépelni a proxy jelszót, a fájlba
titkosítás pedig kulcstároló nélkül csak látszatvédelem. Mivel az app Windows-only,
a crate `cfg(windows)` alá kerül, így a Linuxos CI-t nem érinti.

### Lépések

- [x] 2.1 Rust: `verify_tls` paraméter a `send_request`-ben, hiányzó érték = ellenőrzés BE
- [x] 2.2 Domain + store: `verifyTls` beállítás, alapértelmezés `true`
- [x] 2.3 `httpService`: a beállítás átadása a backendnek
- [x] 2.4 Settings UI: kapcsoló a General szekcióban, figyelmeztető súgószöveggel
- [x] 2.5 `ResponseMeta`: látható jelzés, ha az ellenőrzés ki van kapcsolva
- [x] 2.6 Rust: `secrets` modul a Windows Credential Managerhez, kulcsnév-szűréssel
- [x] 2.7 `settingsStore`: jelszavak ki a localStorage-ból, be a credential store-ba
- [x] 2.8 `tauri.conf.json`: `withGlobalTauri: false` + valódi CSP
- [x] 2.9 A CSP funkcionális ellenőrzése futó appon, nem szemre
- [x] 2.10 Tesztek mindhárom találatra

**Státusz:** ✅ kész

### Eredmény

| Kapu | 1. fázis után | 2. fázis után |
|------|---------------|---------------|
| frontend teszt | 140 | **161** |
| Rust teszt | 16 | **26** (+3 hálózatfüggő, CI-ből kihagyva) |
| `tsc` / `lint` / `clippy -D warnings` | tiszta | tiszta |

### Napló

**B1 — TLS-ellenőrzés, mérve.** A `danger_accept_invalid_certs(true)` helyére
`danger_accept_invalid_certs(!verify_tls)` került, a paraméter hiánya = ellenőrzés BE.
A válasz mostantól visszaadja a `tls_verified` mezőt, amit a UI két helyen mutat: a
response fejlécében egy `⚠ unverified TLS` jelvény, és a hálózati tooltipben egy sor.

Ezt nem hittem el magamnak, hanem megmértem. Három hálózatfüggő teszt készült
(`#[ignore]`-olva, hogy a CI-t ne tegye instabillá, futtatás: `cargo test -- --ignored`):

| Teszt | Eredmény |
|-------|----------|
| lejárt tanúsítvány, ellenőrzés BE | elutasítva ✅ |
| lejárt tanúsítvány, ellenőrzés KI | átengedve, `tls_verified: false` ✅ |
| érvényes tanúsítvány, ellenőrzés BE | átengedve, `tls_verified: true` ✅ |

Ez pozitív és negatív kontroll is egyben: nemcsak azt igazolja, hogy a rossz tanúsítvány
elhasal, hanem azt is, hogy a kapcsoló tényleg kapcsol, és hogy a normál kérések nem törtek el.

**B6 — jelszavak a Windows Credential Managerben.** Új `secrets` Rust modul a `keyring`
crate-tel, `[target.'cfg(windows)'.dependencies]` alatt, hogy a Linuxos CI-t ne érintse;
nem-Windows célon egy no-op fallback fordul. A kulcsnevek IPC-ről jönnek, ezért
`[A-Za-z0-9_.-]`-re szűrve, 64 karakterig.

A frontend oldalon a `partialize` most üres stringre cseréli a két jelszómezőt mentés előtt,
és a `hydrateSecrets()` tölti vissza őket induláskor. A bizonyíték egy közvetlen teszt:
beírunk egy jelszót, majd megnézzük a tényleges localStorage-tartalmat, és az nem
tartalmazhatja a jelszót — miközben a store-ban ott van, és a `set_secret` hívás elment.

**B7 — CSP és a globális Tauri objektum, futó appon ellenőrizve.** A `withGlobalTauri`
`false`-ra állítása biztonságos volt: a kódbázisban sehol nincs `window.__TAURI__`
hivatkozás. A CSP viszont pont az a fajta változtatás, amit nem szabad vakon szállítani —
egy rossz direktíva üres ablakot ad, ami sem a fordításban, sem a tesztekben nem látszik.

Ezért funkcionális próbát csináltam ahelyett, hogy ránéztem volna: töröltem a state fájlt,
elindítottam az appot, és azt figyeltem, megjelenik-e újra. Ez azért érvényes mérés, mert a
state fájlt kizárólag a React mentő-effektje írja — ha a webview nem tölti be a bundle-t,
soha nem jön létre. Debug buildben 3 másodperc alatt megjelent, dev módban 36 alatt (ebben
benne van a Rust újrafordítás). A Tauri sémája szerint a `csp` dev módban is érvényes, ha
nincs külön `devCsp`, ezért kellett mindkettőt megnézni.

**Amit a saját szabályok elkaptak.** A 0. fázisban bekapcsolt `react-hooks/exhaustive-deps`
azonnal megfogott egy valódi hiányzó függőséget a `useRequestActions`-ben. Egy tesztem pedig
a saját frissen írt kódomban talált hibát: a `getGeneralSettings` a `{...defaults, ...stored}`
spreaddel az explicit `null`-t is átvitte volna, ami egy régi vagy kézzel szerkesztett
settings blobnál **némán kikapcsolta volna a tanúsítvány-ellenőrzést**. Most kulcsonként
szűr, és `null`-ra is az alapértelmezés érvényesül.

**Nyitott, a 6. fázisra.** A Settings General szekciója továbbra is nagyrészt placebo — most
a `verifyTls` az egyetlen bekötött mező benne. Ez tudatos: a mintát felállítottam, a többi
mező bekötése a 6. fázis dolga.

---

## Fázis 3 — Perzisztencia és memória

**Cél:** a legnagyobb egyszeri nyereség. A P5 (minden gépelési szünet után 86 MB YAML)
és az M1 (250+ MB állandó memória) ugyanabból a gyökérből jön: az előzmény a **teljes
válasz-törzset** tárolja.

**Amit a 0. fázis előkészítése kimutatott:** a `HistoryEntry.response` mezőt a kód
**sehol nem olvassa**. A HistoryList csak a `request.method`-ot és `request.url`-t
használja, a kattintás is csak a `request`-et tölti be. A tárolt válasz tehát tiszta
pazarlás — elhagyása nulla UX-változással jár.

**Kiindulási mérés (a review-ból):** 50 előzmény 1 MB-os törzsekkel → 86,1 MB YAML,
1077 ms szerializálás a fő szálon, majd ugyanez IPC-n át, majd szinkron lemezre írás.

### Lépések

- [x] 3.1 Domain: a `HistoryEntry.response` lecserélése törzs nélküli összefoglalóra
- [x] 3.2 `historyStore`: az összefoglaló előállítása mentéskor
- [x] 3.3 `STATE_VERSION` 2-re, és az első valódi migráció: a törzsek eltávolítása régi fájlokból
- [x] 3.4 Rust: `save_state` legyen `async`, hogy ne a fő szálat blokkolja
- [x] 3.5 `App.tsx`: a `beforeunload` kezelő ne kötődjön újra minden renderben
- [x] 3.6 Mérés előtte/utána — a nyereség számokkal, ne érzésre
- [x] 3.7 Tesztek: az előzménybe soha ne kerüljön törzs, és a migráció a régi fájlból is kivegye

**Státusz:** ✅ kész

### Eredmény

| Kapu | 2. fázis után | 3. fázis után |
|------|---------------|---------------|
| frontend teszt | 161 | **181** |
| Rust teszt | 26 | 26 (+3 hálózatfüggő) |

**Szintetikus mérés — YAML szerializálás a fő szálon, 1 MB-os válasz-törzsekkel:**

| Előzmény | Előtte | Utána | Arány |
|----------|--------|-------|-------|
| 1 bejegyzés | 1,7 MB / 31 ms | 0,4 kB / 1 ms | ~4 900× |
| 10 bejegyzés | 17,2 MB / 215 ms | 2 kB / 1 ms | ~10 600× |
| 50 bejegyzés | **86,0 MB / 1 041 ms** | **7 kB / 5 ms** | ~11 800× |

**Megtartott memória, 50 bejegyzés külön-külön 1 MB-os válaszból:**
60,8 MB → **1,2 MB** JS heapen.

**Éles mérés a gépeden lévő valódi state fájlon:**

| | Előtte | Utána |
|--|--------|-------|
| verzió | 1 | 2 |
| fájlméret | **5 652 kB** | **36 kB** |
| előzmény-bejegyzés | 66 | 66 (mind megmaradt) |
| válasz-törzs a fájlban | van | nincs |

### Napló

**A gyökér egyetlen mező volt.** A `HistoryEntry.response` a teljes `HttpResponse`-t
tárolta, törzsestül. Ezt a 0. fázisban derítettem ki, hogy **sehol nem olvassa a kód**:
a HistoryList csak a `request.method`-ot és `request.url`-t használja, a kattintás is csak
a `request`-et tölti be. A mező helyére egy `HistoryResponseSummary` került
(status, statusText, size, time) — ez elég egy jövőbeli státusz-jelvényhez az előzménylistában,
és nulla UX-változással jár.

**Első valódi migráció.** `STATE_VERSION` 1-ről 2-re, és a 1. fázisban felépített
migrációs lánc megkapta az első bejegyzését: a `dropHistoryResponseBodies` a régi
fájlokból is kiszedi a törzseket. Emellett a mentési és a betöltési út is átengedi a
választ egy `toHistorySummary` szűrőn, tehát törzs akkor sem kerülhet a fájlba, ha
valamilyen más úton mégis bejutna a store-ba.

**Nem hittem el magamnak, megmértem — kétszer.** Az első memória-mérésem hibás volt:
mind az 50 bejegyzés ugyanazt a body string-referenciát osztotta, így 0 MB különbséget
mutatott. A második próbálkozás külön törzseket használt, de RSS-t mért, ami az allokátor
csúcsát mutatja és nem a megtartott adatot — ott a v2 gyanúsan magas 70 MB-ot adott.
Csak a harmadik változat volt érvényes: kikényszerített GC után `heapUsed`. Ez adta a
60,8 → 1,2 MB-ot.

A végső bizonyíték viszont nem szintetikus: a gépeden lévő 5,6 MB-os, valódi, 66 bejegyzéses
v1 fájlon futtattam le az appot. 36 kB lett belőle, minden előzménnyel és minden kérés-adattal
együtt, és nulla válasz-törzzsel. A migráció előtti fájlt biztonsági másolatként meghagytam
`apilator-state.yaml.pre-migration-backup` néven — ez törölhető.

**A Rust `save_state` mostantól async**, `spawn_blocking`-gel. Szinkron Tauri-parancsként a
fő szálon írt, ami a régi 86 MB-os fájlnál érezhető akadás volt. Az új méret mellett ez már
kevésbé számít, de a helyes forma így is ez.

**Az `App.tsx` mentő effektje kettévált.** A `beforeunload` kezelő eddig minden renderben
leszedődött és újra felkerült, mert a friss adatokra volt szüksége. Most egy ref tartja a
legfrissebb pillanatképet, így a listener egyszer regisztrálódik, a debounce-olt mentés
pedig külön effektben maradt.

---

## Fázis 4 — Nézet-teljesítmény

**Cél:** a válaszmegjelenítő két négyzetes algoritmusa és a hex-nézet korlátlan költsége.

**Fedett találatok:** P1, P2, P3.

### Lépések

- [x] 4.1 `groupMatchesByLine`: két mutatós egymenetes bejárás a beágyazott ciklus helyett
- [x] 4.2 `buildLineStarts` prefix-sum tömb, `findLineAt` bináris kereséssel
- [x] 4.3 `toHex`/`toBase64`: bájt-lookup táblák és felső méretkorlát látható jelzéssel
- [x] 4.4 Ekvivalencia-tesztek a régi implementációk mint referencia ellen
- [x] 4.5 Mutációs teszt: a tesztek tényleg fognak-e hibát
- [x] 4.6 Mérés előtte/utána

**Státusz:** ✅ kész

### Eredmény

| Művelet | 1,2 MB / 64k sor | | 6,2 MB / 320k sor | |
|---------|------------------|--|-------------------|--|
| | előtte | utána | előtte | utána |
| találatok sorokhoz rendelése (P1) | 772 ms | **2,0 ms** | 3 376 ms | **13,4 ms** |
| sorkezdetek, 40 sor/frame (P2) | 3,8 ms | **0,03 ms** | 19,3 ms | **0,004 ms** |
| hex nézet (P3) | 359 ms | **130 ms** | 3 284 ms | **206 ms** |

Frontend teszt: 198 → **203**.

### Napló

**P1 — a keresés négyzetes volt.** A `useLineMatches` minden sorra végigment az összes
találaton. Mivel mindkét lista rendezett, egyetlen menetben szétoszthatók: egy futó mutató
halad a találatokon, ahogy a ciklus halad a sorokon. O(sorok × találatok) helyett
O(sorok + találatok). 6 MB-on 3,4 másodperces fagyásból 13 ms lett.

**P2 — a sorkezdet minden renderelt sorra nulláról indult.** Prefix-sum tömb egyszer,
`useMemo`-ban; a lekérdezés utána tömbindexelés. Az aktuális találat sorát bináris keresés
adja meg a lineáris pásztázás helyett. Frame-enkénti 19,3 ms-ból 0,004 ms lett.

Mindkettő kikerült a komponensekből a `utils/lineIndex.ts`-be, így tesztelhető a
rendereléstől függetlenül.

**Ekvivalencia-teszt referenciával.** A régi implementációkat szó szerint bemásoltam a
tesztfájlba orákulumnak, és 30 véletlen (de determinisztikus seedű) szövegen, négy külön
lekérdezéssel hasonlítom össze őket az újakkal. Az optimalizálás csak gyorsabb lehet,
viselkedésben nem térhet el.

**A mutációs teszt vakfoltot talált.** Nem elégedtem meg azzal, hogy a tesztek zöldek —
megnéztem, elhasalnak-e, ha szándékosan elrontom a kódot. Három mutációt próbáltam, és
kettőt **nem fogtak meg**: a sorvég off-by-one hibáját és a sorhatár-őrzés törlését.

Az ok: a véletlen szöveggenerátorom csak nyomtatható karakterrel kezdődő találatokat állít
elő, tehát semmi nem gyakorolta a sortörés-pozíciókat. Öt célzott határeset-teszttel
pótoltam (sortörésre eső találat, sorhatáron átnyúló találat, pontosan a sor elején és
végén végződő találat, egymást követő sortörések). Ezek után mind a három mutáció elhasal.

**P3 — a hex nézet.** Itt is mértem, mielőtt átírtam volna. Kiderült, hogy a költség
nagyobb részét nem a string-összefűzés adja (a V8 rope-okat használ, az `+=` amortizáltan
olcsó), hanem a bájtonkénti `toString(16).padStart(2,'0')`: 1,2 MB-on 85,6 ms önmagában.
Egy 256 elemű lookup táblával ugyanez 3,3 ms — 26-szoros.

A teljes átírás lookup táblákkal 5-szörös nyereség, de a költség még mindig a törzs
méretével nőtt. Megmértem a lusta változatot is (csak a látható ~60 sor generálása): 0,6 ms,
azaz ~600-szoros — viszont az átszabná a keresést és a virtualizálót is, mert a `formatBody`
jelenleg egyetlen stringet ad vissza, amit a nézet felszeletel.

A választás: gyors implementáció **plusz** 2 MB-os felső korlát, látható
`[truncated: showing the first X MB of Y MB]` jelzéssel. Így a költség a törzs méretétől
függetlenül korlátos (6 MB-on 3 284 ms helyett 206 ms), az architektúra változatlan, a
keresés és a virtualizálás sértetlen, és a felhasználó tudja, hogy csonkolt nézetet lát.
A lusta soronkénti generálás továbbra is nyitva áll, ha valaha kell a teljes hex dump.

---

## Fázis 5 — Hálózati réteg

**Cél:** a `http_client.rs` három hiányossága: nincs kapcsolat-újrahasználat, nincs
válaszméret-korlát, és nincs megszakítás.

**Fedett találatok:** P4, M2, B8.

### Lépések

- [x] 5.1 Kliens-cache a kapcsolat-konfiguráció szerinti kulccsal, a timeout kérésenként
- [x] 5.2 Streamelt válaszolvasás felső korláttal, `truncated` jelzéssel
- [x] 5.3 Bináris válaszok base64-ként, `from_utf8_lossy` helyett
- [x] 5.4 Megszakítás: `request_id` + `cancel_request` parancs, `tokio::select!`
- [x] 5.5 Verseny-védelem: elavult válasz nem írja felül az újabbat
- [x] 5.6 UI: Cancel gomb, bináris és csonkolás jelzés
- [x] 5.7 Tesztek, köztük pozitív kontroll a pooling bizonyítására

**Státusz:** ✅ kész

### Eredmény

Rust teszt: 26 → **42** (+5 hálózatfüggő). Frontend teszt: 203 → **207**.

### Napló

**P4 — nem volt connection pooling.** A `send_request` minden hívásnál új
`reqwest::Client`-et épített, a pool pedig a kliensben él, tehát minden kérés új TCP-t és
teljes TLS-handshake-et csinált. Most a kliensek cache-elve vannak azon beállítások szerint,
amik a kapcsolat felépítését befolyásolják (TLS-ellenőrzés, redirect-politika, proxy-identitás);
a timeout kérésenként állítódik a `RequestBuilder`-en, így nem kell külön kliens minden
timeout-értékhez.

**Ezt bizonyítani kellett, nem állítani.** Beépítettem egy kulcsonkénti építés-számlálót,
és a teszt azt méri, hogy az első hívás pontosan egy klienst épít, a következő kettő pedig
nullát. Az első változatom globális számláló volt — az instabil lett, mert más tesztek is
építettek klienst párhuzamosan. A kulcsonkénti számlálás immunis erre.

Utána pozitív kontrollt is futtattam: kivettem a cache-lekérdezést a `get_client`-ből, és a
teszt azonnal elhasalt. Enélkül nem tudnám, hogy a teszt egyáltalán képes-e hibát fogni.

**M2 — nem volt méretkorlát és a bináris válasz sérült.** A `response.bytes()` az egészet
memóriába olvasta; most `response.chunk()`-kal darabonként olvas, és a limitnél megáll,
`truncated: true` jelzéssel. A `String::from_utf8_lossy` pedig minden érvénytelen bájtot
U+FFFD-re cserélt, azaz a bináris válaszokat csendben tönkretette. Mostantól: ha a törzs
érvényes UTF-8, szövegként megy át; ha nem, base64-ként, `body_encoding` mezővel. A UI
jelzi, ha bináris a válasz.

**B8 — nem lehetett megszakítani.** A kérés kap egy azonosítót, a backend regisztrál hozzá
egy `oneshot` csatornát, és `tokio::select!`-tel várja vagy a választ, vagy a megszakítást.
A UI-ban a loading állapotban megjelent egy Cancel gomb.

Emellett a review-ban említett verseny is megszűnt: ha ugyanarra a tabra új kérés indul,
a régebbi válasza már nem írja felül az újabbat, mert a hook ellenőrzi, hogy még az ő
kérése-e az aktuális.

**Egy mellékes javítás, ami tesztet is stabilizált.** A `perform_request` eddig előbb épített
klienst, és csak utána validálta a metódust és a fejléceket. Megfordítottam: így egy hibás
kérés nem is nyúl a cache-hez, ami egyszerre logikusabb és megszüntetett egy
teszt-interferenciát.

**Ami átcsúszott a 6. fázisba.** A `SendRequestOptions` mostantól tud timeout-ot,
méretkorlátot és redirect-kapcsolót fogadni, és a backend is kezeli őket — de a hívó oldal
még nem adja át a Settings értékeit. Ez tudatos: a csővezeték kész, a bekötés a 6. fázis
feladata. A B2 ismert-hiba teszt ennek megfelelően frissült.

---

## Fázis 6 — Halott UI bekötése

**Cél:** ne maradjon olyan kapcsoló a felületen, ami nem csinál semmit.

**Fedett találatok:** B2, B3.

### Lépések

- [x] 6.1 JWT aláírás Rust oldalon, HMAC-kal (HS256/384/512)
- [x] 6.2 A JWT algoritmuslista szűkítése arra, amit alá tudunk írni
- [x] 6.3 `resolveAuth`: a JWT bekötése a kérésbe, header és query cél is
- [x] 6.4 A bekötendő General beállítások átvezetése a kérésre
- [x] 6.5 A be nem köthető beállítások eltávolítása
- [x] 6.6 Settings-migráció, hogy a régi `requestTimeout: 0` ne jelentsen végtelen várakozást
- [x] 6.7 Tesztek, köztük kereszt-implementációs JWT vektorok

**Státusz:** ✅ kész

### Eredmény

Rust teszt: 42 → **59**. Frontend teszt: 207 → **228**.

| Beállítás | Előtte | Utána |
|-----------|--------|-------|
| `verifyTls` | — | bekötve (2. fázis) |
| `requestTimeout` | halott | bekötve, alapértelmezés 30 000 ms |
| `maxResponseSize` | halott | bekötve, streamelt olvasás állítja meg |
| `autoFollowRedirects` | halott | bekötve, `redirect::Policy` |
| `httpVersion` | halott | bekötve, `http1_only()` |
| `sendNoCacheHeader` | halott | bekötve, `Cache-Control: no-cache` |
| `responseFormatDetection` | halott | bekötve, kikapcsolva raw nézet |
| `disableCookies` | halott | **eltávolítva** — nincs cookie jar, amit ki lehetne kapcsolni |
| `requestValidation` | halott | **eltávolítva** — nem volt definiálva, mit validálna |
| `sendTokenHeader` | halott | **eltávolítva** — nem volt definiálva, milyen token |
| `retainHeadersOnRedirect` | halott | **eltávolítva** — a reqwest nem kínál rá kapcsolót |

### Napló

**Korrekció a review-hoz.** Azt írtam a B3-nál, hogy a HeadersEditor félrevezetően kiírja,
hogy Authorization header fog menni. Ez **nem áll**: a HeadersEditor a `computeAuthHeader`-t
használja, ami JWT-re `null`-t ad, tehát nem jelenít meg semmit. A `hasAuthHeader`-nek pedig,
amire a félrevezetést alapoztam, **egyetlen fogyasztója sincs** a kódbázisban. A valódi hiba
egyszerűbb, de ugyanolyan súlyos: a JWT auth némán nem csinált semmit.

**JWT aláírás.** Nem vettem fel `jsonwebtoken` crate-et, mert az típusos claim-eket vár, a UI
viszont nyers JSON-t ad. `hmac` + `sha2` fölött ~40 sor a teljes implementáció, és pontosan
azt a JSON-t írja alá, amit a felhasználó beírt.

Két dolog, amit a tesztírás hozott elő:

- Az első "RFC 7515 vektor" tesztem valójában csak a szignatúra hosszát és a determinizmust
  ellenőrizte — a kommentje viszont azt állította, hogy végponttól végpontig rögzíti a HS256-ot.
  Ez nem volt igaz. Lecseréltem valódi kereszt-implementációs vektorokra: a három tokent
  a Node `crypto.createHmac`-jával generáltam, és a teszt pontosan azokat várja. Ez már
  bizonyítja, hogy a szignatúra helyes HMAC, nem csak önmagával konzisztens.
- Ez a teszt azonnal fogott is egy hibát: a `serde_json` alapból ábécésorrendbe rakja az
  objektumkulcsokat, tehát a payload claim-jei átrendeződtek volna a felhasználó beírásához
  képest. Bekapcsoltam a `preserve_order` feature-t.

Emellett a fejlécben az `alg` mező kényszerítve a ténylegesen használt algoritmusra, hogy egy
felhasználói `{"alg":"none"}` ne tudjon mást állítani, mint amivel aláírtunk.

**Amit inkább kivettem, mint meghagytam.** Négy beállítást töröltem a kivezetés helyett:
a `disableCookies`-hoz nincs is cookie jar (a reqwest `cookies` feature nincs bekapcsolva),
a `requestValidation` és a `sendTokenHeader` szemantikája sosem volt definiálva, a
`retainHeadersOnRedirect`-re pedig a reqwest nem ad kapcsolót. Egy nem létező funkció
kapcsolója rosszabb, mint a hiánya.

**Settings-migráció.** A `requestTimeout` alapértelmezése 0 volt, ami most már tényleges
"soha ne járjon le"-t jelent — a régi felhasználók így csendben elveszítenék azt a 30 másodperces
timeoutot, amit a beégetett érték adott nekik. Ezért a zustand persist kapott egy verziót és
egy migrációt, ami a 0-t a valódi alapértelmezésre cseréli, de a felhasználó által beállított
értéket békén hagyja.

---

## Fázis 7 — Struktúra és réteghatárok

**Cél:** a saját `ARCHITECTURE.md`-ben leírt rétegszabályok ne dokumentáció legyenek, hanem
kikényszerítettek.

**Fedett találatok:** S1, S2, S3 és az öt import-sértés.

### Lépések

- [x] 7.1 `computeAuthHeader` / `hasAuthHeader` átköltöztetése a domain rétegbe
- [x] 7.2 `usePersistence` hook: a perzisztencia kikerül az `App.tsx`-ből
- [x] 7.3 `systemService` + `useAppInfo`: az AboutSection nem hív `invoke`-ot
- [x] 7.4 `ResponseViewer` mentése a `fileService`-en át
- [x] 7.5 `useResizable`: nincs több renderenkénti localStorage-olvasás
- [x] 7.6 A Settings `PasswordInput` átnevezése, hogy ne ütközzön a közössel
- [x] 7.7 `ScrollingUrl`: egy observer, felesleges időzítő nélkül
- [x] 7.8 ESLint réteghatár-szabály, pozitív kontrollal ellenőrizve

**Státusz:** ✅ kész

### Eredmény

| Sértés | Állapot |
|--------|---------|
| `HeadersEditor` → `httpService` | megszűnt (a helper a domainbe került) |
| `ResponseViewer` → Tauri pluginok | megszűnt (`fileService` a hookon át) |
| `AboutSection` → `invoke` | megszűnt (`systemService` + `useAppInfo`) |
| `App.tsx` → `persistenceService` | megszűnt (`usePersistence`) |
| `App.tsx` → `@tauri-apps/api/window` | megszűnt (`useDevWindowTitle`) |

`grep` a teljes `src/views/` fán és az `App.tsx`-en: **nulla** service- vagy Tauri-import.

### Napló

**A lint most már őrzi a rétegeket.** Négy szabálycsoport került az ESLint configba:
a views és az `App.tsx` nem importálhat service-t vagy `@tauri-apps/*`-ot, a domain nem
importálhat semmilyen keretrendszert vagy felsőbb réteget, a services pedig nem tudhat
store-okról, view-król és hookokról.

A szabály azonnal bizonyította a hasznát: **találtam vele egy sértést, amit én magam
hagytam ki** a manuális átnézésnél — az `App.tsx` közvetlenül importálta a
`getCurrentWindow`-t a dev ablakcím beállításához.

Pozitív kontrollal is ellenőriztem: beraktam egy `httpService` importot egy view-ba és egy
`zustand` importot a domainbe — mindkettőre elhasalt a lint. Egy szabály, ami nem fog hibát,
csak zaj.

**Az ötödik "sértés" nem volt sértés.** Az `App.tsx` `persistenceService` importja valós volt,
de a mögötte lévő probléma nagyobb: a teljes betöltési és mentési logika a komponensben ült.
Ez most a `usePersistence` hookban van, ami a hookokra vonatkozó szabály szerint (hookok
hívhatnak service-t) a helyén van, és az `App.tsx` 40 sorral rövidebb lett.

**Az S2 nem duplikáció volt.** A review azt írta, hogy a két `PasswordInput` ugyanaz kétszer.
Megnézve nem: az egyik a közös `Input`/`Button` komponensekre épül szöveges kapcsolóval, a
másik a settings saját stílusát és szem-ikonokat használ, label-lel. Két vizuális változat,
nem másolás. Összevonni csak a stílus paraméterezésével lehetne, ami a Settings megjelenését
kockáztatná érdemi nyereség nélkül. Amit tényleg zavaró volt, az az azonos név — a settings-belit
`SettingsPasswordInput`-ra neveztem át.

**S1 és S3.** A `useResizable` minden renderben szinkron `localStorage.getItem`-et hívott;
most egyszer, lazy `useState`-tel. A `ScrollingUrl` előzményelemenként egy `ResizeObserver`-t
**és** egy `setTimeout`-ot indított — az observer az `observe()` hívásakor amúgy is tüzel
egyszer, tehát az időzítő felesleges volt.

---

## Fázis 8 — Repó-higiénia

**Cél:** a repó legyen olyan állapotban, hogy publikálható lenne — akkor is, ha a
publikálás maga még nincs napirenden.

**Státusz:** ✅ kész

### Lépések

- [x] 8.1 MIT LICENSE
- [x] 8.2 Duplikált és használatlan képek törlése
- [x] 8.3 `favicon.ico` valódi ICO-ra cserélve
- [x] 8.4 Splash és logó a tényleges megjelenítési mérethez igazítva
- [x] 8.5 `src-tauri/gen/schemas/` kivezetése a verziókövetésből
- [x] 8.6 Szemétfájlok törlése
- [x] 8.7 Nem használt Rust függőség eltávolítása, `tokio` feature-ök szűkítése
- [x] 8.8 Bundle target Windowsra szűkítve
- [x] 8.9 README újraírása
- [x] 8.10 `ARCHITECTURE.md` frissítése a kikényszerített rétegszabályokkal

### Eredmény

| Tétel | Előtte | Utána |
|-------|--------|-------|
| `public/favicon.ico` | **994 kB** (átnevezett PNG) | **16 kB** (valódi ICO, 16/32/48/64) |
| `public/apilator_splash.png` | 1 459 kB (1024×1024) | **196 kB** (512×512) |
| `public/icon.png` | 994 kB (705×824) | **85 kB** (219×256) |
| gyökérben duplikált képek | 4 003 kB | **0** |
| `dist/` teljes mérete | **3,9 MB** | **820 kB** |
| LICENSE | nincs | MIT |

### Napló

**A favicon nem favicon volt.** Byte-szinten megnéztem: a `public/favicon.ico` első nyolc
bájtja `89 50 4e 47 ...`, azaz PNG-magic. Egy 994 kB-os PNG volt `.ico` kiterjesztéssel,
amit az `index.html` minden indításnál betöltött. Most valódi, több felbontást tartalmazó
ICO, 16 kB.

**A képméretek a tényleges megjelenítéshez igazítva.** A splash 1024×1024 volt, de a
`#splash img` legfeljebb az ablak 80%-át tölti ki; 512×512 bőven elég. A logó 705×824 volt,
miközben az About panel 80×80-ban rajzolja ki. Ezek nem esztétikai döntések: a `dist/`
3,9 MB-ból 820 kB lett, és ebből a splash már csak 196 kB, ami közvetlenül az indulási időt
érinti.

A gyökérben lévő `apilator_splash.png`, `icon.png` és `app_icon.png` a `public/` alattiak
duplikátumai vagy használatlanok voltak — a build csak a `public/`-ot szolgálja ki. Törölve.

**Két képet nem nyúltam meg**, mert nem tudom, mit szánsz nekik: az `app_icon_trimmed.png`
a gyökérben és a `public/apilator_200x200.png` — mindkettő verziókövetetlen, és úgy néznek ki,
mint amiket te készítettél elő valamihez. A 200×200-as különösen alkalmasnak tűnik splashnek,
de ezt nem akartam eldönteni helyetted.

**Függőségek.** A `serde_yaml` (ráadásul deprecated crate) sehol nem szerepelt a Rust
forrásban — kivéve. A `serde_json` viszont mostantól valóban használt, a JWT modul miatt.
A `tokio` `features = ["full"]`-ról a ténylegesen használt négyre szűkült
(`rt-multi-thread`, `macros`, `sync`, `time`).

**Bundle target.** `"all"` helyett `["msi", "nsis"]` — az app Windows-only, a többi célpont
generálása csak időt vitt volna.


---

# Második etap

Az első etap lezárása után futtatott átnézés három olyan hibát talált, ami ugyanabba az
osztályba tartozik, mint amit az első etapban irtottunk: **a UI ígér valamit, amit a kód nem
csinál meg**. Kettőt közülük ez a munka vitt be vagy hagyott benne.

## Új találatok

**B10 — a Form Data body semmit nem küld.** A `BodyEditor` felkínálja a Form Data fület és
kulcs-érték szerkesztőt ad hozzá, a `httpService` viszont csak `raw` és
`x-www-form-urlencoded` esetén állít össze törzset. Form Data esetén `body: undefined` megy a
backendnek. Ez az **első etap review-jából kimaradt** — ugyanaz a hibaosztály, mint a B2/B3.

**B11 — a hex nézet bináris válasznál nem a bájtokat mutatja.** Az 5. fázisban vezettük be,
hogy a nem UTF-8 törzs base64-ként érkezik. A `toHex` viszont ezt a base64 *szöveget* kódolja
hexbe:

```
valódi bájtok : 89 50 4e 47 0d 0a 1a 0a     (PNG fejléc)
hex nézet     : 69 56 42 4f 52 77 30 4b     ("iVBORw0K" base64 szöveg hexe)
```

Súlyosbító körülmény, hogy a bináris jelzés kifejezetten a hex nézetre irányítja a
felhasználót.

**B12 — a proxy bypass lista figyelmen kívül marad.** `http_client.rs`: `let _ = &custom.bypass;`.
A Settingsben ki lehet tölteni, hatása nincs.

**B13 — a system proxy hitelesítés figyelmen kívül marad.** A `system_proxy_auth` eljut a
backendig, ahol soha nem használjuk fel. A Settings „Default proxy authentication"
felhasználónév/jelszó mezője így semmit nem csinál.

## Mért tesztlefedettség a második etap előtt

| Réteg | Lefedettség |
|-------|-------------|
| `src/domain` | 93,6% |
| `src/utils` | 94,2% |
| `src/stores` | 84,9% |
| `src/services` | 83,2% |
| **`src/hooks`** | **0%** |
| **`src/views`** | **0%** |
| **összesen** | **24,4%** |

A hookokban ül a `useRequestActions`: a küldés, a megszakítás és az elavult-válasz
verseny-védelme — mind az 5. fázisban írt logika, egyetlen teszt nélkül.

---

## Fázis 9 — Blokkolók a második átnézésből

**Cél:** ne maradjon olyan felület, ami nem létező funkciót ígér.

**Fedett találatok:** B10, B11, B12, B13.

### Lépések

- [x] 9.1 Rust: `multipart/form-data` összeállítás, szöveges mezőkkel és fájlokkal
- [x] 9.2 Rust: a fájlok beolvasása méretkorláttal, útvonal-validációval
- [x] 9.3 Frontend: a Form Data body átadása a backendnek, fájlválasztó a UI-ban
- [x] 9.4 A hex nézet a valódi bájtokat kapja bináris válasznál
- [x] 9.5 Proxy bypass lista bekötése
- [x] 9.6 System proxy hitelesítés bekötése
- [x] 9.7 Tesztek mind a négy találatra, pozitív kontrollal

**Státusz:** ✅ kész

### Eredmény

Rust teszt: 59 → **77** (+6 hálózatfüggő). Frontend teszt: 228 → **246**.

### Napló

**B10 — Form Data, fájlfeltöltéssel.** A `reqwest` `multipart` feature bekapcsolva; a
`SendRequestParams` kapott egy `form_data` mezőt, aminek jelenléte felülírja a sima `body`-t.
A fájlrészeket a Rust oldal olvassa be, 100 MB-os felső korláttal, és a hibát megnevezve
adja vissza (`FILE_NOT_READABLE`, `FILE_TOO_LARGE`, `INVALID_CONTENT_TYPE`) ahelyett, hogy
csendben kihagyná a részt.

Egy részlet, ami könnyen elrontható: multipartnál **nem szabad** kézzel `Content-Type`
fejlécet küldeni, mert a reqwest a saját boundary-jével állítja be. A `httpService` ezért
form-data esetén törli a fejlécet, akkor is, ha a felhasználó kézzel megadta — erre külön
teszt van.

A UI-ban új `FormDataEditor`: soronként átkapcsolható szöveg és fájl között, fájlnál
fájlválasztóval. A dialógus a `fileService`-en és egy `useFilePicker` hookon át érhető el,
hogy a 7. fázisban felállított réteghatár ne sérüljön — a lint ezt ellenőrzi is.

**A bizonyíték nem szintetikus.** Írtam egy hálózatfüggő tesztet, ami a httpbin.org-ra küld
egy szöveges mezőt és egy valódi fájlt, és a visszaküldött echóban ellenőrzi, hogy **mindkettő
megérkezett**. Enélkül csak azt tudnám, hogy a `form_data` mező eljut a backendig.

**B11 — a hex nézet a valódi bájtokat mutatja.** A `formatBody` kapott egy `encoding`
paramétert. Base64 törzsnél a hex nézet előbb visszafejti a bájtokat. Mérve a javítás előtt
és után, PNG-fejléccel:

```
előtte : 69 56 42 4f 52 77 30 4b     ("iVBORw0K" base64 szöveg hexe)
utána  : 89 50 4e 47 0d 0a 1a 0a     (a tényleges bájtok)
```

A bináris jelzés szövege is pontosabb lett: eddig a hex nézetre irányított, miközben az volt
a hibás.

**B12 — proxy bypass.** A `reqwest::NoProxy::from_string` pontosan erre való; a beállításból
jövő lista most ezen keresztül kerül a proxyra. Fontos mellékhatás: a bypass lista bekerült a
kliens-cache kulcsába, különben két eltérő bypasszal rendelkező konfiguráció ugyanazt a
cache-elt klienst kapná — erre külön teszt van.

**B13 — system proxy hitelesítés.** A reqwest megtalálja a rendszer proxyját, de nem enged
hozzá hitelesítést adni. Ezért új `system_proxy` modul olvassa ki Windowson a regisztrációs
adatbázisból (`Internet Settings\ProxyServer`), és abból épül explicit proxy a
felhasználónévvel és jelszóval. A Windows kétféle formátumot tárol (`host:port` vagy
`http=...;https=...`), mindkettőt kezeli, https-preferenciával — hét teszt fedi a
formátum-változatokat.

**Pozitív kontroll mindkét blokkolóra.** Kikapcsoltam a form-data ágat: 5 teszt hasalt el.
Visszaállítottam a hexet a régi hibás viselkedésre: 2 teszt hasalt el. A tesztek tehát valóban
fognak, nem csak zöldek.

---

## Fázis 10 — Tesztlefedettség: hookok és nézetek

**Cél:** a 24,4%-os összlefedettség mögött két teljesen fedetlen réteg áll, és az egyikben
(`src/hooks`) ül a legkockázatosabb logika: a küldés, a megszakítás és az elavult-válasz
verseny-védelme.

### Lépések

- [x] 10.1 `@testing-library/react` beállítása, jsdom környezettel
- [x] 10.2 `useRequestActions`: küldés, megszakítás, verseny-védelem, mentés
- [x] 10.3 `usePersistence`: betöltés, hibatűrés, debounce-olt mentés
- [x] 10.4 Komponens-tesztek a valódi interakciós felületekre
- [x] 10.5 Lefedettségi küszöb a CI-ban, hogy ne csússzon vissza

**Státusz:** ✅ kész

### Eredmény

| Réteg | Előtte | Utána |
|-------|--------|-------|
| `src/hooks` | **0%** | **35,6%** (a két logikai hook fedve) |
| `src/views` | **0%** | részleges (FormDataEditor, ResponseMeta) |
| `src/stores` | 84,9% | 88,6% |
| `src/utils` | 94,2% | 95,3% |
| **összesen** | **24,4%** | **31,7%** |

Frontend teszt: 246 → **300**.

### Napló

**A gépeden `NODE_ENV=production` van globálisan beállítva.** Ez azonnal kiderült, amint az
első komponens-teszt lefutott: `act(...) is not supported in production builds of React` —
a React a production buildjét töltötte be. A vitest configban most rögzítve van
`NODE_ENV=test`, tehát a tesztek nem függenek a környezettől. Érdemes tudnod róla, mert
más eszközök viselkedését is befolyásolhatja.

**A hookok tesztelése hozta a legtöbb értéket.** A `useRequestActions`-ben ül az 5. fázisban
írt verseny-védelem, ami eddig egyetlen teszt nélkül volt. A teszt két párhuzamos kérést
indít, az újabbat oldja fel előbb, majd a régebbit, és ellenőrzi, hogy a régebbi nem írja
felül a tab állapotát és nem is kerül be az előzménybe. **Pozitív kontroll:** a verseny-őr
kivételével 2 teszt azonnal elhasal.

A `usePersistence` tesztjei között ott a B9 regressziós védelme is: ha a betöltés vagy a
hidratálás dob, az app akkor is „ready" állapotba kerül — ez az a hiba, ami korábban örökre
a splash képernyőn hagyta az appot.

**Három saját hibát találtak a tesztek írás közben:**

- Hiányzott a `cleanup()` a tesztek között, ezért a korábbi tesztek hookjai felcsatolva
  maradtak és tovább reagáltak a store-változásokra — a mentés-számláló 6-ot, 8-at, 18-at
  mutatott 1 helyett.
- A debounce-teszteknél az időzítő-léptetést ugyanabba az `act`-be tettem, mint a
  store-változást, így az effekt még nem regisztrálta újra a timert.
- A `ResponseMeta` teszt-helperében `undefined`-ot adtam át egy alapértelmezett értékkel
  rendelkező paraméternek — ami JS-ben az alapértelmezést aktiválja, tehát a teszt nem azt
  vizsgálta, amit hittem. Most `null` a „nincs érték" jelzés.

**Rétegenkénti lefedettségi küszöb.** Globális szám helyett rétegenként van küszöb: a
logikát tartó rétegek magasan (domain 90%, utils 90%, stores 85%, services 80%), a
prezentációs komponensekre nincs. Egy globális szám ott renderelési teszteket jutalmazna,
amik semmit nem állítanak. A küszöböt pozitív kontrollal ellenőriztem: 99%-ra emelve a
utils küszöböt a build azonnal elhasal.

A CI mostantól `test:coverage`-t futtat, tehát a küszöb ott is kapu.

---

## Fázis 11 — Collections

**Cél:** mentett, elnevezett kérések fa szerkezetben — ez a legnagyobb funkcionális hiány
egy API klienshez képest.

**Döntés:** collection > mappa > kérés, tetszőleges mélységben, drag & droppal átrendezhető,
**külön fájlba** mentve a tab-állapottól függetlenül.

### Lépések

- [x] 11.1 Domain: fa-modell és tiszta fa-műveletek (keresés, beszúrás, törlés, mozgatás)
- [x] 11.2 A fa-műveletek tesztelése, beleértve a köröket megelőző védelmet
- [x] 11.3 Rust: általánosított, atomi fájlkezelés több állományra
- [x] 11.4 `collectionsService` + `collectionsStore`
- [x] 11.5 UI: Collections panel a sidebarban, fa nézettel
- [x] 11.6 Drag & drop átrendezés
- [x] 11.7 Kérés mentése collectionbe, betöltése tabba
- [x] 11.8 Tesztek

**Státusz:** ✅ kész

### Eredmény

Rust teszt: 77 → **81**. Frontend teszt: 300 → **385**.

### Napló

**A fa-műveletek a domain rétegben ülnek, tiszta függvényekként.** `findNode`,
`insertNode`, `removeNode`, `moveNode`, `renameNode` — mind a fát kapja és újat ad vissza,
így a store vékony burkoló marad, a lényeg pedig React nélkül tesztelhető. 42 teszt fedi.

A legfontosabb közülük a `moveNode` védelme: **egy mappát nem lehet önmagába vagy a saját
leszármazottjába ejteni**. Enélkül az a részfa leszakadna a fáról, és minden benne lévő
kérés elveszne — ezt drag & droppal két másodperc alatt elő lehetne idézni. A visszautasítás
oka névvel tér vissza (`into-own-subtree`), így a UI meg tudja mondani, miért nem ment.

Külön teszt igazolja, hogy egy négy lépéses mozgatás-sorozat után **ugyanannyi csomópont van
a fában**, mint előtte — semmi nem tűnik el útközben.

**A perzisztencia általánosítva.** A Rust oldal `load_state`/`save_state`/`backup_state`
parancsai helyett most `load_data`/`save_data`/`backup_data` van, `kind` paraméterrel.
A kind egy zárt lista (`state`, `collections`, `environments`), tehát **fájlnév soha nem
megy át az IPC-n** — a `../../etc/passwd` már a névfeloldásnál elbukik, erre teszt is van.
Az atomi írás és a backup-mechanizmus így minden adatfájlra automatikusan érvényes; a backup
neve is a forrásfájl nevét követi.

**A collections külön fájlba megy** (`apilator-collections.yaml`), a tab-állapottól
függetlenül. Ugyanaz a hibatűrés, mint az állapotfájlnál: sérült YAML vagy ismeretlen verzió
esetén félretesszük, nem töröljük, és egy hibás csomópont csak önmagát viszi, nem az egész
fájlt.

**Két saját hibát találtak a tesztek:**

- A parser mindig kiírta a `collapsed: false`-t, tehát a köroda nem volt pontos, és minden
  csomópont felesleges mezőt kapott. Most csak akkor kerül a fájlba, ha igaz.
- A `loads a valid file` teszt a fixture-t kétszer hívta meg, ami minden hívásnál új
  header-UUID-kat generált — ugyanaz a hiba, amit a 3. fázisban már egyszer elkövettem.

**UI.** A sidebar History és Collections fülre bomlott. A fa HTML5 drag & droppal
rendezhető: egy mappa közepére ejtve bekerül, a felső és alsó harmadára ejtve elé vagy mögé.
Jobbklikk menü új mappához, átnevezéshez, törléshez. A Save gomb az URL sáv mellett menti
az aktuális kérést — ha még nincs collection, létrehoz egyet, hogy ne kelljen külön
felfedezni ezt a lépést.

---

## Fázis 12 — Környezetek és változók

**Cél:** ugyanaz a kérés futtatható dev, staging és prod ellen, és az API kulcsok ne
kerüljenek lemezre plaintextben.

### Lépések

- [x] 12.1 Domain: környezet-modell és `{{név}}` behelyettesítés
- [x] 12.2 `environmentsService`: külön fájl, titkos értékek nélkül
- [x] 12.3 Titkos változók a Windows Credential Managerben
- [x] 12.4 `environmentsStore`
- [x] 12.5 Behelyettesítés a teljes kérésre a küldés előtt
- [x] 12.6 UI: környezetválasztó és szerkesztő
- [x] 12.7 Tesztek, pozitív kontrollal

**Státusz:** ✅ kész

### Eredmény

Frontend teszt: 385 → **438**.

### Napló

**Az ismeretlen változó nem tűnik el.** A `{{név}}` feloldásnál két viselkedés közül lehet
választani: az ismeretlen nevet üresre cserélni, vagy meghagyni. Az elsőnél egy elgépelt
placeholder némán üres stringgé válik, és a kérés rossz URL-re megy anélkül, hogy bármi
jelezné. Ezért a feloldatlan név **változatlanul marad**, és a függvény külön visszaadja a
listájukat, hogy a hívó tudjon róla.

Emellett a behelyettesítés **nem rekurzív**: egy `{{a}}` értékű `a` változó nem okoz végtelen
ciklust — erre teszt is van.

**A behelyettesítés mindenhova kiterjed**, ahova a felhasználó gépelhet: URL, fejléc-nevek és
-értékek, query paraméterek, raw és form testek, valamint az auth mezők (basic felhasználónév
és jelszó, bearer token, JWT secret és payload). Külön teszt fedi mindegyiket, és egy
pozitív kontroll igazolja, hogy a behelyettesítés kikapcsolásával azonnal 6 teszt hasal el.

**A titkos változók ugyanazt az utat járják, mint a proxy jelszó a 2. fázisban.** A
`secret: true` mezővel jelölt változó értéke a Windows Credential Managerbe megy
`env.<környezet>.<változó>` kulccsal, a környezetfájlba pedig üres string kerül. A store
gondoskodik a takarításról is: ha egy változó megszűnik titkosnak lenni, vagy törlik, vagy
az egész környezetet törlik, a hozzá tartozó credential is eltűnik — mindhárom esetre van
teszt. Nyitva hagyott credential egy open source projektnél különösen kellemetlen lenne.

**A betöltés nem bízik a fájlban.** Ha az `activeEnvironmentId` olyan környezetre mutat,
ami már nincs meg, a választó `null`-ra esik vissza, nem egy fantom bejegyzésre.

---

## Fázis 13 — Import/export

**Döntés:** saját collection formátum export/import **és** OpenAPI 3 import. curl-generálás
és Postman-import nem kell.

### Lépések

- [x] 13.1 Saját formátum exportálása fájlba
- [x] 13.2 Import: saját formátum és OpenAPI 3 felismerése, JSON és YAML alakban is
- [x] 13.3 OpenAPI → collection átalakítás, tagek szerinti mappákkal
- [x] 13.4 Séma alapú példa-body generálás
- [x] 13.5 UI: Import és Export gomb a collections panelen
- [x] 13.6 Tesztek

**Státusz:** ✅ kész

### Eredmény

Frontend teszt: 438 → **513**. Lefedettség: 31,7% → **38,0%**.

### Napló

**Az OpenAPI-átalakítás a domain rétegben ül**, tiszta függvényként — 44 teszt fedi, és a
`src/domain` lefedettsége 97,7%-ra nőtt.

Néhány döntés, ami használhatóbbá teszi az importált kéréseket:

- **A path paraméterek a mi placeholder-szintaxisunkra fordulnak**: `/pets/{petId}` →
  `/pets/{{petId}}`. Így a 12. fázisban bevezetett környezeti változók azonnal ki tudják
  tölteni őket, ahelyett hogy kézzel kellene átírni minden importált URL-t.
- **Az opcionális query paraméterek kikapcsolva jönnek**, a kötelezők bekapcsolva. Egy
  frissen importált kérés így elküldhető úgy, ahogy van.
- **A body a sémából generálódik**, rekurzívan, mélységkorláttal — beágyazott objektumok és
  tömbök is. Ha a spec megad explicit `example`-t vagy `default`-ot, az nyer.
- **A műveletek az első tagjük szerint mappákba kerülnek**, a tag nélküliek a gyökérbe.

Éles ellenőrzés egy valódi Petstore-szerű specen: 4 kérés, `[pets]` mappa, a `/health`
a gyökérben, a szerver URL végi perjele levágva (nem lett dupla perjel), a POST body
`{ "name": "string", "age": 0, "tags": [ "string" ] }`, a kötelező `limit` bekapcsolva,
az opcionális `sort` kikapcsolva az első enum értékkel.

**Az import hozzáad, nem cserél.** Egy „replace" viselkedés csendes módja lenne mindent
elveszíteni; a beolvasott collectionök a meglévők mellé kerülnek.

**A lefedettségi küszöb dolgozott.** Az `environmentsService`-t a 12. fázisban a store-on
keresztül teszteltem, magát a service-t nem — a `src/services` küszöb ezt most elkapta
(73,1% a 80%-os határral szemben), és a build elbukott. Nem a küszöböt vittem lejjebb, hanem
megírtam a hiányzó 24 tesztet; a service most 87,7%-on áll. Ezek közül a legfontosabb az,
ami byte-szinten ellenőrzi, hogy a mentett fájl **nem tartalmazza** a titkos értéket.

---

## Fázis 14 — Kiadás-előkészítés

### Lépések

- [x] 14.1 CHANGELOG.md
- [x] 14.2 CONTRIBUTING.md
- [x] 14.3 SECURITY.md
- [x] 14.4 Verzió 0.9.0-ra, egy helyen mindhárom manifestben
- [x] 14.5 A User-Agent verziója build-időben injektálva, ne kézzel írt string legyen
- [x] 14.6 README kiegészítése az új funkciókkal és az adatfájlokkal

**Státusz:** ✅ kész

### Napló

**A verzió 0.9.0 lett, nem 1.0.0.** Ez javaslat volt, nem parancs: az `1.0.0` azt üzeni,
hogy a termék kész, és bár a collections és a környezetek most már megvannak, egy publikus
első kiadásnál a `0.9.0` őszintébb, és nem égeti el az `1.0.0`-t. **Egy sor mindhárom
manifestben, ha mást szeretnél.**

**Egy beégetett verziószám is előkerült.** A `createDefaultHeaders` `Apilator/0.1.0`-t
küldött User-Agentként — kézzel írt string, ami a verzióemelésnél magától elavul. Most a
`package.json`-ból jön build-időben. Ellenőriztem a lefordított bundle-ben:
`const gv="0.9.0"` és `Apilator/${gv}`.

Az első ellenőrző szondám itt hibás volt: reguláris kifejezéssel kerestem a kész
`Apilator/0.9.0` stringet a buildben, de a template literal futásidőben áll össze, tehát
nem találtam volna akkor sem, ha minden rendben van. A szondát kellett javítani, nem a kódot.

**A SECURITY.md nem általánosságokat sorol.** Konkrétan leírja, mi kerül lemezre, mi a
Credential Managerbe, és mi nem tárolódik sehol — plusz azt a két dolgot, ami egy API
kliensnél tényleg meglepetés lehet: a változó-behelyettesítés a titkot beleírja a kérésbe,
és az exportált collection a benne lévő tokent is viszi.

**A CONTRIBUTING.md a projekt tanulságait kéri számon**, nem stílusszabályokat: legyen
teszt, ami a változtatás nélkül elhasalna; tartsd a réteghatárokat (a lint úgyis szól);
ne kerüljön be félig működő funkció; és a teljesítményállítás mellé legyen mérés.

---

# Második etap — összesítés

Mind a hat fázis (9–14) kész, minden pipeline zöld.

| Kapu | Első etap után | Most |
|------|----------------|------|
| frontend teszt | 228 | **513** |
| Rust teszt | 59 | **81** (+6 hálózatfüggő) |
| lefedettség | 31,7% | **38,0%** |
| `src/domain` | 93,8% | **97,7%** |
| `src/services` | 83,2% | **87,7%** |
| `src/stores` | 88,6% | **91,4%** |
| CI | 9 zöld pipeline | **16 zöld pipeline** |
| verzió | 0.1.0 | **0.9.0** |

**Lezárt találatok:** B10 (Form Data nem küldött semmit), B11 (hex nézet bináris válasznál),
B12 (proxy bypass), B13 (system proxy hitelesítés).

**Új funkciók:** collections fa szerkezettel és drag & droppal, környezetek titkos
változókkal, `multipart/form-data` fájlfeltöltéssel, collection export/import, OpenAPI 3
import.

**Kiadási darabok:** LICENSE (MIT, első etap), CHANGELOG, CONTRIBUTING, SECURITY.

## Ami tudatosan kimaradt

- **Kódaláírás.** Aláíratlan MSI-nél a Windows SmartScreen figyelmeztet. Ehhez tanúsítvány
  kell, ami pénzbe kerül és a te döntésed.
- **GitHub, winget, chocolatey.** A kérésednek megfelelően nincs napirenden.
- **A `src/views` nagy része teszteletlen** (TabBar, Sidebar, a legtöbb közös komponens).
  A logikai rétegek magasan fedettek, a prezentációs komponensekre tudatosan nincs küszöb —
  ott egy szám csak olyan renderelési teszteket jutalmazna, amik semmit nem állítanak.
- **Két kép verziókövetetlen maradt**: `app_icon_trimmed.png` és
  `public/apilator_200x200.png`. Nem tudom, mit szánsz nekik.

---

# Harmadik etap

**Döntések (a felhasználótól):**

| Kérdés | Döntés |
|--------|--------|
| Repó | **Teljes költözés GitHubra.** A GitLab archiválódik, a `.gitlab-ci.yml` helyére GitHub Actions kerül. |
| Csomagkezelők | Most **csak** updater + GitHub release. Winget és chocolatey később. |
| Kódaláírás | Most **aláírás nélkül**, dokumentálva. A Tauri updater minisign aláírása ettől függetlenül elkészül. |
| Rétegdokumentumáció | A `docs/DOMAIN.md`, `SERVICES.md`, `STORES.md` **törlődik**, a tartalmuk a README-be olvad. |

## Git history átvizsgálás publikálás előtt

282 fájl fordult elő valaha a történetben; a teljes tartalom átnézve minden commitban.

**Nem találtam bizalmas adatot.** Nulla API kulcs, token, jelszó, privát kulcs vagy
felhő-credential; a mintaillesztés találatai mind kódazonosítók (`secretKeyFor`,
`SECRET_KEYS`) és egy `"my-secret-key"` teszt-fixture. Valódi e-mail cím sincs a
tartalomban. Az állapotfájl — ami a felhasználó valódi kéréseit tartalmazta — soha nem
volt commitolva, a `.gitignore` végig kizárta.

Három teendő publikálás előtt:

1. `.claude/settings.local.json` verziókövetve volt — lokális fájl, lokális útvonalakkal.
2. A `CLAUDE.md` elavult útvonalakat írt (`C:\projectspilator`).
3. A commit-szerző e-mail címe minden commitban látszik.

**Döntés a 3. ponthoz:** a GitHubra **history nélkül**, egyetlen kezdő committal megy fel a
projekt, `146177+lexandro@users.noreply.github.com` szerzővel. A teljes fázisonkénti
history a GitLab repóban marad meg archívumként. Megjegyzés: az mdedit 145 publikus
GitHub-commitja már most a valódi e-mail címet viseli, tehát ez a lépés csak az Apilatorra
véd.

## Fázisok

| # | Fázis | Állapot |
|---|-------|---------|
| 15 | Dokumentáció összevonása a README-be | ✅ kész |
| 16 | Auto-update és Help felület | ✅ kész |
| 17 | GitHub költözés és release pipeline | ⬜ |

---

## Fázis 15 — Dokumentáció

**Cél:** a README önmagában elmondja, ami eddig három elavult fájlban volt.

**Státusz:** ✅ kész

### Napló

**A három rétegdokumentum februári volt** — az utolsó commitjuk az eredeti MVVM refaktor —,
és **egyiket sem frissítette** a két etap alatt hozzáadott kilenc modul: `collection`,
`environment`, `openApi`, a négy új service és a két új store. A README linkelte őket,
tehát egy publikus repóban aktívan félrevezettek volna.

A `docs/DOMAIN.md`, `SERVICES.md` és `STORES.md` törölve; a tartalmuk a README „Where things
live" szakaszába olvadt, rétegenkénti modul-táblázatokkal — beleértve a Rust oldalt is, ami
eddig sehol nem volt dokumentálva.

**Két lokális szivárgás is kikerült:** a `.claude/settings.local.json` verziókövetve volt
(csak engedélylista, de lokális útvonalakkal), és a `CLAUDE.md` a régi `C:\projects\apilator`
útvonalat írta, miközben a projekt már `C:\projects\apps\apilator` alatt van.

---

## Fázis 16 — Auto-update és Help felület

**Cél:** a telepített app frissítse magát GitHub release-ből, az mdedit mintája szerint.

**Státusz:** ✅ kész

### Lépések

- [x] 16.1 `tauri-plugin-updater` és `tauri-plugin-process`
- [x] 16.2 Aláíró kulcspár generálása (a privát kulcs a repón kívül)
- [x] 16.3 Endpoint és publikus kulcs a `tauri.conf.json`-ban, `createUpdaterArtifacts`
- [x] 16.4 Capabilities: `updater:default`, `process:default`, `core:app:allow-version`
- [x] 16.5 `updaterService` és `useUpdater` hook
- [x] 16.6 Help felület: Updates és Changelog szekció a Settingsben
- [x] 16.7 Frissítés-sáv az ablak tetején
- [x] 16.8 Tesztek

### Eredmény

Frontend teszt: 513 → **531**.

### Napló

**Az mdedit mintáját követi**, mert az már bevált: a háttérellenőrzés csak **felajánl**,
soha nem tölt le magától, és a telepítés mindig felhasználói döntés. Az automatikus
ellenőrzés csendes marad, ha nem talál semmit vagy ha hibára fut — a kézi ellenőrzés
viszont visszajelez mindkét esetben. Erre külön tesztpár van, mert ez a különbség könnyen
elveszik egy refaktorban.

**A Help felület** a Settings modalba került, az mdedit Help menüjének tartalmával:
Updates (ellenőrzés, telepítés, letöltési százalék) és Changelog. Az About megmaradt.

**A changelog build-időben inlineolódik** (`CHANGELOG.md?raw`), tehát amit az appban
olvasol, az mindig a futó verzióhoz tartozik — nem egy időközben frissült távoli fájl.
A lefordított bundle-ben ellenőriztem, hogy tényleg bekerült.

**Az aláíró kulcs a repón kívül van**: `~/.tauri/apilator.key`. A publikus fele a
`tauri.conf.json`-ba került, a privát felét a GitHub secretekbe kell felvenni. A repóban
nincs `.key` fájl, ezt külön ellenőriztem.

**Az `updaterService` a pending `Update` objektumot modulszinten tartja**, nem a store-ban:
a plugin objektuma metódusokat hordoz, amit egy state-proxy eltörne. Ez ugyanaz a csapda,
amit az mdedit kommentje is jelez.

---

## Fázis 17 — GitHub költözés és release pipeline

**Cél:** a GitHub legyen az egyetlen origin, működő CI-val és release-folyamattal.

**Státusz:** 🟡 folyamatban

### Lépések

- [x] 17.1 GitHub Actions CI: a GitLab CI kapui átültetve
- [x] 17.2 Release workflow: tag → aláírt build → GitHub Release `latest.json`-nal
- [x] 17.3 `.gitlab-ci.yml` eltávolítva
- [x] 17.4 README, CONTRIBUTING, SECURITY átírva GitHubra
- [ ] 17.5 Publikus repó létrehozása és feltöltés history nélkül
- [ ] 17.6 Aláíró secretek felvétele
- [ ] 17.7 Első release tag

### Napló

**A Rust job Windowsra került.** A GitLab CI-ban Linuxon futott, ami működött, de az app
Windows-only, és a `secrets.rs` meg a `system_proxy.rs` valódi implementációja csak
Windowson fordul — Linuxon a no-op fallback fordult, tehát a CI a szállított kódot nem is
ellenőrizte. Most `windows-latest`.
