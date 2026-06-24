# Repository Guidelines

## Project Structure & Module Organization
`ClipMark` is split into three main areas:
- `extension/` - Chrome extension source, including `src/content/`, `src/background/`, `src/popup/`, and `src/pages/`.
- `webapp/` - Next.js app, with routes under `app/`, migrations in `migrations/`, and shared helpers in `lib/`.
- `packages/design-system/` - shared CSS tokens used by both surfaces.
- `tests/` - Playwright E2E specs and Node unit tests.

## Build, Test, and Development Commands
Use the root `Makefile` for common workflows:
- `make dev` - run the webapp in Next.js dev mode.
- `make build` - run DB migrations and build the webapp.
- `make start` - start the production webapp.
- `make ext-dev` - run the extension Vite dev server with auto-reload.
- `make ext-build` - build the extension into `extension/dist/`.
- `make test` - run the extension Playwright suite.
- `npm run test:all` - run unit, extension, and webapp visual tests.
- `npm run sync-tokens` - copy shared design tokens into app-specific styles.

## Coding Style & Naming Conventions
Match the existing codebase style:
- JavaScript/TypeScript use 2-space indentation and semicolons where the file already uses them.
- Prefer clear, descriptive names for components, routes, and helpers; keep route folders lowercase and kebab-free unless Next.js requires brackets, such as `app/v/[shareId]/`.
- Keep shared design values in `packages/design-system/tokens.css` instead of duplicating colors or spacing.
- No formatter or linter is enforced repo-wide; follow nearby code patterns and keep edits minimal.

## Testing Guidelines
Testing is split by layer:
- Unit logic tests live in `tests/unit/` and use Node’s built-in `node:test`.
- Browser tests use Playwright specs under `tests/*.spec.ts` and `tests/visual/`.
- Run `npm run test:unit` for fast logic checks, `npm run test:yt` for extension flows, and `npm run test:visual` for webapp checks.
- Add or update tests near the behavior you change, especially for storage schema, bookmark lifecycle, and UI injection flows.

## Commit & Pull Request Guidelines
Commit history uses short conventional prefixes such as `feat:`, `fix:`, `refactor:`, and `chore:`. Keep subject lines imperative and focused on one change.
For pull requests:
- Describe what changed and why.
- Link related issues or follow-up work when relevant.
- Include screenshots or screen recordings for UI changes.
- Run the relevant test commands before asking for review.

## Security & Configuration Tips
Do not commit secrets. Webapp configuration belongs in `webapp/.env.local`, and local extension API targets may need `API_BASE` updated for development.
