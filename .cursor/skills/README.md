# Cursor skills (five-line-staff)

Community Vue skills from [vuejs-ai/skills](https://github.com/vuejs-ai/skills), vendored into this repo for offline/CI use.

## Installed skills

| Skill | Purpose |
|-------|---------|
| `vue-best-practices` | Composition API, SFC, reactivity, composables |
| `vue-pinia-best-practices` | Pinia stores and reactivity |
| `create-adaptable-composable` | `MaybeRef` / reusable composable patterns |

## Refresh from upstream

When GitHub is reachable:

```bash
npx skills add vuejs-ai/skills \
  --skill vue-best-practices \
  --skill vue-pinia-best-practices \
  --skill create-adaptable-composable \
  -a cursor -y
```

Or re-run the project script (jsDelivr mirror):

```bash
python3 scripts/sync-cursor-vue-skills.py
```

## Usage in Cursor

Prefix prompts when you need reliable skill activation:

```text
Use vue skill, <your task>
```

Project-specific constraints live in `.cursor/rules/` (Ionic layout, `scoreUi`, `src/lib` boundaries).

## Pre-commit

On `git commit`, Husky runs:

1. `npm run typecheck` — full-project `vue-tsc --noEmit`
2. `lint-staged` — `eslint` on staged `*.{vue,ts,js,cjs,mjs}` under `src/` / `tests/`

Install hooks after clone: `npm install` (runs `prepare` → `husky`).
