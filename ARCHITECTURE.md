# Apilator Architektúra

> MVVM + Zustand Stores pattern - AI-optimalizált kódbázis

## Réteg Áttekintés

```
┌─────────────────────────────────────────────────────────────┐
│                        Views Layer                          │
│   React komponensek - csak renderelés, nincs üzleti logika  │
│   src/views/                                                │
└───────────────────────────────┬─────────────────────────────┘
                                │ használ
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                       Stores Layer                          │
│   Zustand store-ok - state + üzleti logika                  │
│   src/stores/                                               │
└───────────────────────────────┬─────────────────────────────┘
                                │ hív
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Services Layer                         │
│   Tauri/külső integrációk - HTTP, persistence, file         │
│   src/services/                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │ használ
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                          │
│   Tiszta típusok, factory-k - framework független           │
│   src/domain/                                               │
└─────────────────────────────────────────────────────────────┘
```

## Import Szabályok

| Réteg | Importálhat | Nem importálhat |
|-------|-------------|-----------------|
| Views | stores, domain, hooks, views | services, `@tauri-apps/*` |
| Stores | services, domain | views |
| Services | domain, Tauri APIs | stores, views, hooks |
| Domain | SEMMI (pure types) | minden más, keretrendszereket is |
| Hooks | stores, services, domain | views |

**Ezt az ESLint kényszeríti ki**, nem csak dokumentáció: az `eslint.config.js`
`no-restricted-imports` szabályai elhasalnak, ha egy view service-t importál, ha a domain
keretrendszert hív, vagy ha egy service store-ra hivatkozik. Új rétegsértés így nem tud
észrevétlenül bekerülni.

## Mappastruktúra

```
src/
├── domain/                  # Tiszta típusok és factory-k
│   ├── index.ts             # Központi export
│   ├── request.ts           # HttpRequest, KeyValuePair
│   ├── response.ts          # HttpResponse, RequestState
│   ├── tab.ts               # Tab, TAB_COLORS
│   ├── history.ts           # HistoryEntry
│   ├── auth.ts              # Auth típusok
│   └── settings.ts          # Theme, Proxy, General settings
│
├── stores/                  # Zustand state management
│   ├── index.ts             # Központi export
│   ├── tabsStore.ts         # Tab állapot és műveletek
│   ├── historyStore.ts      # History állapot
│   └── settingsStore.ts     # Unified settings (persist)
│
├── services/                # Külső integrációk
│   ├── index.ts             # Központi export
│   ├── httpService.ts       # Tauri HTTP hívások
│   ├── persistenceService.ts # Tauri storage
│   └── fileService.ts       # Tauri fájl dialógusok
│
├── views/                   # React komponensek
│   ├── TabBar/              # Tab kezelés
│   ├── RequestBuilder/      # Kérés szerkesztő
│   ├── ResponseViewer/      # Válasz megjelenítő
│   ├── Sidebar/             # Oldalsáv, history
│   ├── Settings/            # Beállítások modal
│   └── common/              # Közös UI komponensek
│
├── hooks/                   # UI hook-ok
│   ├── index.ts
│   ├── useResizable.ts
│   ├── useClickOutside.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useRequestActions.ts # Request küldés logika
│   └── ...
│
├── utils/                   # Pure utility függvények
│   ├── formatters.ts
│   └── searchHighlight.ts
│
├── styles/                  # Globális stílusok
│   └── global.css
│
├── App.tsx                  # Fő app komponens
├── App.css                  # App stílusok
└── main.tsx                 # Entry point
```

## "Hol Keressem?" Útmutató

| Keresem... | Hely |
|------------|------|
| Tab műveletek | `stores/tabsStore.ts` |
| History kezelés | `stores/historyStore.ts` |
| Theme/Proxy/General beállítások | `stores/settingsStore.ts` |
| HTTP kérés küldés | `services/httpService.ts` |
| Fájl mentés/betöltés | `services/persistenceService.ts` |
| Request/Response típusok | `domain/request.ts`, `domain/response.ts` |
| UI komponensek | `views/` alatti megfelelő mappa |
| Közös komponensek (Button, Input) | `views/common/` |
| UI helper hook-ok | `hooks/` |

## Store Használat

```typescript
// Komponensben
import { useTabsStore, useHistoryStore, useSettingsStore } from './stores';

function MyComponent() {
  // Szelektív subscription - csak amit használsz
  const tabs = useTabsStore((s) => s.tabs);
  const createNewTab = useTabsStore((s) => s.createNewTab);

  // Több érték
  const { theme, setThemeMode } = useSettingsStore((s) => ({
    theme: s.theme,
    setThemeMode: s.setThemeMode,
  }));
}
```

## Service Használat

```typescript
// Hook-ban vagy App.tsx-ben
import { httpService, persistenceService } from './services';

const result = await httpService.sendRequest(request, proxyConfig);
await persistenceService.saveAppState(tabs, activeTabId, history);
```

## Új Feature Hozzáadása

1. **Új típus?** → `domain/` megfelelő fájl vagy új fájl
2. **Új állapot?** → Meglévő store bővítése vagy új store
3. **Külső integráció?** → `services/` új service
4. **UI komponens?** → `views/` megfelelő almappa
5. **UI segédfüggvény?** → `hooks/` új hook

## Konvenciók

- Store nevek: `use<Name>Store` (pl. `useTabsStore`)
- Service nevek: `<name>Service` objektum (pl. `httpService`)
- Domain fájlok: típusok + factory függvények + konstansok
- Views: egy komponens = egy fájl (+ CSS)
