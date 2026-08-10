# Architecture

Apilator is layered: views render, hooks and stores hold the logic, services talk to the
backend, and the domain layer is pure TypeScript that knows about none of them.

The point of the layering is not tidiness. It is that the interesting logic — the collection
tree, variable substitution, state migration, request building — can be tested without
rendering anything, and that a change to the UI cannot quietly reach into the network layer.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        Views                                │
│   React components. Rendering only, no business logic.      │
│   src/views/                                                │
└───────────────────────────────┬─────────────────────────────┘
                                │ uses
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Hooks and Stores                         │
│   UI logic and Zustand state. The only route to a service.  │
│   src/hooks/ , src/stores/                                  │
└───────────────────────────────┬─────────────────────────────┘
                                │ calls
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                       Services                              │
│   Tauri and outside integrations: HTTP, files, secrets.     │
│   src/services/                                             │
└───────────────────────────────┬─────────────────────────────┘
                                │ uses
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                        Domain                               │
│   Types, factories and pure logic. Framework-free.          │
│   src/domain/                                               │
└─────────────────────────────────────────────────────────────┘
```

## Import rules

| Layer | May import | May not import |
|-------|------------|----------------|
| Views | stores, hooks, domain, other views | services, `@tauri-apps/*` |
| Hooks | stores, services, domain | views |
| Stores | services, domain | views |
| Services | domain, Tauri APIs | stores, views, hooks |
| Domain | nothing | everything else, frameworks included |

**ESLint enforces this**, it is not just documentation. The `no-restricted-imports` rules in
`eslint.config.js` fail the build when a view imports a service, the domain imports a
framework, or a service reaches for a store. A new boundary violation cannot land unnoticed —
the rule caught one during the refactor that introduced it, which a manual review had missed.

## Directory layout

```
src/
├── domain/                   # Pure types, factories and logic
│   ├── request.ts            # HttpRequest, KeyValuePair, FormDataEntry
│   ├── response.ts           # HttpResponse, RequestState
│   ├── auth.ts               # auth configs and the header they produce
│   ├── tab.ts                # Tab, TAB_COLORS
│   ├── history.ts            # HistoryEntry and its response summary
│   ├── collection.ts         # the collection tree and its operations
│   ├── environment.ts        # environments and {{variable}} substitution
│   ├── openApi.ts            # OpenAPI 3 document to collection
│   └── settings.ts           # theme, proxy and general settings
│
├── stores/                   # Zustand state management
│   ├── tabsStore.ts          # open tabs, closed-tab stack, reordering
│   ├── historyStore.ts       # the last 50 requests, as summaries
│   ├── collectionsStore.ts   # the collection tree, persisted on change
│   ├── environmentsStore.ts  # environments, selection, secret handling
│   └── settingsStore.ts      # settings, persisted to localStorage
│
├── services/                 # Outside integrations
│   ├── httpService.ts        # request building, substitution, JWT
│   ├── persistenceService.ts # app state: load, save, migrate, back up
│   ├── collectionsService.ts # collections file, export and import
│   ├── environmentsService.ts# environments file, minus secret values
│   ├── secretsService.ts     # Windows Credential Manager
│   ├── updaterService.ts     # update check and install
│   ├── fileService.ts        # file dialogs
│   └── systemService.ts      # app and OS info, window title
│
├── views/                    # React components
│   ├── TabBar/               # tabs
│   ├── RequestBuilder/       # the request editor
│   ├── ResponseViewer/       # the response viewer
│   ├── Sidebar/              # history
│   ├── Collections/          # the collection tree
│   ├── Environments/         # environment selector and editor
│   ├── Settings/             # settings, updates, changelog, about
│   └── common/               # shared UI components
│
├── hooks/                    # UI logic
│   ├── useRequestActions.ts  # send, cancel, save a response
│   ├── usePersistence.ts     # load and save app state
│   ├── useUpdater.ts         # background update checks
│   ├── useCollectionTransfer.ts # collection export and import
│   └── ...
│
├── utils/                    # Pure helpers
│   ├── formatters.ts         # response formatting: JSON, XML, hex, base64
│   ├── lineIndex.ts          # line offsets and match grouping
│   └── searchHighlight.ts    # diacritic-insensitive search
│
└── App.tsx                   # the shell
```

The Rust side lives in `src-tauri/src/`:

| Module | Responsibility |
|--------|----------------|
| `http_client.rs` | pooled clients, streaming reads, cancellation, multipart |
| `persistence.rs` | atomic writes and backups for every data file |
| `secrets.rs` | Windows Credential Manager |
| `jwt.rs` | HMAC JWT signing |
| `system_proxy.rs` | the Windows proxy setting, so credentials can be attached |
| `system_info.rs` | OS name and architecture |

## Where to look

| Looking for | Where |
|-------------|-------|
| tab operations | `stores/tabsStore.ts` |
| saved requests | `stores/collectionsStore.ts`, `domain/collection.ts` |
| variables | `stores/environmentsStore.ts`, `domain/environment.ts` |
| sending a request | `services/httpService.ts`, `src-tauri/src/http_client.rs` |
| what is stored where | `services/persistenceService.ts` and its siblings |
| request and response types | `domain/request.ts`, `domain/response.ts` |
| shared components | `views/common/` |

## Using a store

```typescript
import { useTabsStore, useSettingsStore } from './stores';

function MyComponent() {
  // Subscribe to one value at a time; a selector returning a new object
  // re-renders on every store change.
  const tabs = useTabsStore((s) => s.tabs);
  const createNewTab = useTabsStore((s) => s.createNewTab);
  const theme = useSettingsStore((s) => s.theme);
}
```

## Using a service

Views never do this. Hooks and stores do.

```typescript
import { httpService } from '../services';

const result = await httpService.sendRequest(request, {
  proxy: getProxyConfig(),
  variables: getVariables(),
});
```

## Adding something new

| What you are adding | Where it goes |
|---------------------|---------------|
| a type or pure function | `domain/` |
| state and the logic around it | an existing store, or a new one |
| anything touching the backend | `services/`, reached through a hook or store |
| a component | the matching folder under `views/` |
| UI logic a component needs | `hooks/` |

Put the logic as far down as it will go. Anything in `domain/` or `utils/` can be tested
directly, which is why those layers carry the highest coverage requirements.

## Conventions

- Stores are named `use<Name>Store`, services `<name>Service`
- One component per file, with its CSS beside it
- Code, comments and test names are English
- Comments explain what the code cannot: a non-obvious invariant, a workaround's reason, a
  mechanism that has to be revisited later. Not what the next line does.
