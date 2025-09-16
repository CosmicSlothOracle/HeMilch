# QTE Standalone – Project Architecture Guidelines

## 1. High-Level Layering

1. **Engine** – Pure runtime mechanics (game loop, physics, collision, asset loading, low-level rendering helpers).
2. **Domain** – Game-specific logic organised in feature folders (combat, animation, AI, level scripting, etc.).
3. **UI / Presentation** – React components for HUD, menus, overlays and debug panels.
4. **Shared** – Cross-cutting utilities, types and constants.

Each layer only imports _downwards_. The UI layer should never call Engine code directly but rather expose messages or hooks handled by the Domain layer.

## 2. Recommended Folder Layout

```
src/
  engine/
    gameLoop.ts
    assetLoader.ts
    collisionSystem.ts
    index.ts             // barrel export
  domain/
    combat/
      fighter.ts
      attack.ts
      damage.ts
      index.ts
    ai/
      simpleAi.ts
      behaviorRegistry.ts
      index.ts
    animation/
      spriteAnimator.ts
      index.ts
  ui/
    hud/
    menu/
    index.tsx            // React root
  shared/
    types/
    utils/
```

`public/` keeps raw assets (atlases, JSON, sounds). Packaged artefacts live in `dist/`.

## 3. Naming & Conventions

* **Files**: `lowerCamel.ts` for modules; `PascalCase.tsx` for React components.
* **Classes**: PascalCase (`Fighter`, `SpriteAnimator`).
* **Functions**: verbNoun (`updatePosition`).
* Provide a `index.ts` barrel file in every folder exporting its public API.
* Use absolute imports via path alias `@/` (configured in `tsconfig.json`).
  Example: `import { Fighter } from '@/domain/combat';`

## 4. Event-Driven Rules

* The main render/update loop emits frame events.
* Systems subscribe or are called in deterministic order: `Input → Physics → AI → Combat → Animation → Render`.
* Avoid side effects across systems; share state via lightweight components/records.

## 5. Tooling Guardrails

* **Type Checking**: `npm run type-check` must pass on CI.
* **Lint / Format**: ESLint + Prettier in a pre-commit hook (Husky).
* **Tests**: Vitest with coverage gate at 80 %. Each new feature ships at least one test.
* **Storybook (optional)**: for React UI components.

## 6. Contribution Checklist

1. Add/modify code only inside the proper layer.
2. Export through the local `index.ts`.
3. Write/adjust tests.
4. Run `npm run type-check && npm run test`.
5. Create a concise PR description referencing issue/feature.

---

> Keep modules small, pure and focused. The quieter the code, the easier the debugging.
