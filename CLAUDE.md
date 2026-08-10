# Apilator

RESTful API tesztelő kliens Windows-ra.

## Kommunikáció

- **Nyelv**: Magyar
- **Fontos**: Ne feltételezz, hanem kérdezz!

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Rust + Tauri v2
- **Package Manager**: Bun (nem npm!)
- **Platform**: Windows desktop

## Architektúra

MVVM + Zustand Stores pattern. Részletes dokumentáció: `ARCHITECTURE.md`

```
Views → Stores → Services → Domain
```

| Réteg | Mappa | Felelősség |
|-------|-------|------------|
| Views | `src/views/` | React komponensek (csak UI) |
| Stores | `src/stores/` | Zustand state + business logic |
| Services | `src/services/` | Tauri/külső integrációk |
| Domain | `src/domain/` | Típusok, factory-k |
| Hooks | `src/hooks/` | UI helper hook-ok |

## Projekt Struktúra

```
src/
├── domain/           # Típusok és factory-k
├── stores/           # Zustand state management
├── services/         # Tauri integrációk
├── views/            # React komponensek
├── hooks/            # UI hook-ok
├── utils/            # Pure utility függvények
├── styles/           # Globális stílusok
├── App.tsx           # Fő app komponens
└── main.tsx          # Entry point

src-tauri/            # Rust/Tauri backend
  src/lib.rs          # Tauri commands
  src/main.rs         # Entry point

docs/                 # Dokumentáció
scripts/              # PowerShell helper scriptek
```

### "Hol Keressem?" Gyorskalauz

| Keresem... | Hely |
|------------|------|
| Tab műveletek | `stores/tabsStore.ts` |
| History kezelés | `stores/historyStore.ts` |
| Settings (theme, proxy) | `stores/settingsStore.ts` |
| HTTP kérés küldés | `services/httpService.ts` |
| Request/Response típusok | `domain/request.ts`, `domain/response.ts` |
| UI komponensek | `views/` megfelelő almappa |

## Fejlesztési Parancsok

```powershell
bun install           # Függőségek telepítése
bun run dev           # Dev szerver indítása
bun run vite build    # Frontend build (gyors)
bunx tsc --noEmit     # TypeScript típusellenőrzés
```

### Bash parancsok és Windows útvonalak

**FONTOS**: Ne használj `cd` parancsot abszolút Windows útvonalakkal bash-ben!

```bash
# ❌ ROSSZ - nem működik
cd C:\projects\apps\apilator\src-tauri && cargo check

# ✅ JÓ - relatív útvonal vagy flag használata
cargo check --manifest-path src-tauri/Cargo.toml
```

A working directory a projekt gyökere (`C:\projects\apps\apilator`), használj relatív útvonalakat.

## Production Build

```powershell
# Teljes build (EXE + MSI installer)
bun run build
# vagy
.\scripts\build.ps1

# Csak EXE (gyorsabb, installer nélkül)
.\scripts\build.ps1 -ExeOnly

# Build és mappa megnyitása
.\scripts\build.ps1 -OpenFolder
.\scripts\build.ps1 -ExeOnly -OpenFolder
```

### Output fájlok
- **EXE**: `target/release/apilator.exe` (standalone, futtatható install nélkül)
- **MSI**: `target/release/bundle/msi/` (Windows installer)

### Verziókezelés
A verzió a `src-tauri/tauri.conf.json` fájlban van:
```json
{
  "version": "0.1.0"
}
```


## Kódminőségi Elvek

### KISS (Keep It Simple, Stupid)
- Egyszerű, érthető megoldások előnyben
- Ne bonyolítsd túl - ha nehéz elmagyarázni, valószínűleg túl komplex
- Egy függvény = egy feladat

### Clean Code
- Beszédes változó- és függvénynevek (a kód legyen önmagát dokumentáló)
- Rövid függvények (max 20-30 sor)
- Kerüld a mély nesting-et (max 2-3 szint)
- DRY (Don't Repeat Yourself) - de ne erőltesd az absztrakciót 2 ismétlés alatt

### SOLID Elvek
- **S**ingle Responsibility: Egy komponens/hook = egy felelősség
- **O**pen/Closed: Bővíthető legyen új funkciókkal, de ne kelljen meglévőt módosítani
- **L**iskov Substitution: (TypeScript-ben kevésbé releváns)
- **I**nterface Segregation: Kis, célzott prop interface-ek
- **D**ependency Inversion: Hook-ok és callback-ek a függőségekhez

### Refaktorálási Jelek
Azonnal refaktorálj, ha:
- Egy fájl > 200 sor
- Egy komponens > 100 sor JSX
- Egy hook > 5 különböző felelősséget kezel
- Copy-paste kód jelenik meg
- Túl sok prop drilling (3+ szint)

## Konvenciók

### Frontend (TypeScript/React)
- Functional components + hooks
- TypeScript strict mode
- CSS fájlok komponensenként
- Komponensek max 1 fájl = 1 komponens (+ styled subcomponents)

### Backend (Rust)
- Tauri commands a `lib.rs`-ben
- `#[tauri::command]` attribútum minden API-hoz
- Serde a szerializációhoz

### Tauri IPC
```typescript
// Frontend hívás
import { invoke } from "@tauri-apps/api/core";
const result = await invoke<ResponseType>("command_name", { param: value });
```

```rust
// Backend command
#[tauri::command]
fn command_name(param: String) -> Result<ResponseType, String> {
    // ...
}
```

## Fő Funkciók (tervezett)

- HTTP kérések küldése (GET, POST, PUT, DELETE, PATCH)
- Request/Response history
- Környezetek és változók kezelése
- Request collections mentése
- JSON/XML response formázás

---

## Tanulságok és Szabályok

> Refaktorálások és fejlesztések során felmerült problémák elkerülésére

### Fájl átnevezés/áthelyezés

**Probléma:** Windows-on a dev server (Vite/Node) lock-olja a fájlokat, ezért `mv` és `Rename-Item` nem működik.

**Megoldás:**
```powershell
# 1. Először állítsd le a dev szervert
taskkill //F //IM "node.exe"
taskkill //F //IM "apilator.exe"

# 2. Majd végezd el az átnevezést
```

### Zustand Store Pattern

**Szabály:** Ha állapotot és annak műveleteit kezeled, használj Zustand store-t, ne custom hook-ot.

```typescript
// ✅ JÓ - Store pattern
export const useMyStore = create<MyState>((set, get) => ({
  data: [],
  addItem: (item) => set((s) => ({ data: [...s.data, item] })),
}));

// ⚠️ KERÜLENDŐ - Custom hook state-tel
export function useMyData() {
  const [data, setData] = useState([]);
  const addItem = useCallback((item) => { ... }, []);
  return { data, addItem };
}
```

### Import Szabályok Betartatása

| Réteg | Importálhat | NEM importálhat |
|-------|-------------|-----------------|
| Views | stores, domain, hooks | services |
| Stores | services, domain | views |
| Services | domain | stores, views |
| Domain | SEMMI | minden más |

**Ellenőrzés:** `grep -r "from ['\"]\.\.\/services" src/views/` - nem szabad találatot adnia

### Prop Drilling Alternatívája

Ha egy komponensnek sok (5+) callback prop-ja van, fontold meg:
1. A komponens közvetlenül használja a store-t
2. Vagy context-et a callback-eknek

```typescript
// ⚠️ Sok prop
<TabBar
  onSelect={...} onClose={...} onRename={...}
  onColorChange={...} onDuplicate={...} onReorder={...}
/>

// ✅ Store használat a komponensben
function TabBar() {
  const { selectTab, closeTab } = useTabsStore();
  // ...
}
```

### Refaktorálás Közben

1. **Mindig TypeScript check futtatása** - minden fázis után `bunx tsc --noEmit`
2. **Dev server leállítása** - fájlműveletek előtt
3. **Inkrementális változtatások** - egy fájl/mappa egyszerre
4. **Import utak frissítése** - grep-pel ellenőrizd a régi import-okat
