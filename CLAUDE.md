# CLAUDE.md

EDH Score Recorder: a WXT (Manifest V3) Chrome extension that scrapes players and commanders from SpellTable and Convoke games and submits results to Notion.

- **Code map**: entry points and their URL matches in `entrypoints/`; message actions in `entrypoints/background.ts`; storage keys in `src/shared/storage.ts`; submit flow and Notion requests in `src/shared/submit.ts` and `src/shared/notion.ts`.
- **Commands**: `package.json` scripts. `dev` and `build*` read the Notion token through the 1Password CLI (`op run`); without `op`, build as CI does with `npx wxt build --mode prod`.
- **Notion schema and env vars**: `README.md` and `.env.example`.
- **Past fixes**: before debugging or designing, search `docs/solutions/` (YAML frontmatter: `module`, `tags`, `problem_type`).
- **Testing Convoke without a real game**: `docs/dev/convoke-test-helper.md`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for diegolamanno/spelltable-chrome-extension (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
