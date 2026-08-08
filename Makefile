# Clipmark — dev commands
# Usage: make <target>

.PHONY: help dev build start db-migrate sync-tokens design-audit ext-dev ext-build ext-zip ext-open test test-report clean

WEBAPP_DIR := webapp
EXT_DIR    := extension
EXT_DIST   := $(EXT_DIR)/dist
ZIP_NAME   := clipmark-extension.zip

# ── Default ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Clipmark commands"
	@echo ""
	@echo "  Webapp"
	@echo "    make dev        — next dev (hot reload)"
	@echo "    make build      — next build (NO migrations)"
	@echo "    make start      — next start (production)"
	@echo "    make db-migrate  — run DB migrations vs DATABASE_URL (deliberate; staging first)"
	@echo ""
	@echo "  Extension"
	@echo "    make ext-dev    — extension dev server (CRXJS + auto reload workflow)"
	@echo "    make ext-build  — build extension to extension/dist"
	@echo "    make ext-zip    — build + zip extension/dist for Chrome Web Store"
	@echo "    make ext-open   — open chrome://extensions in default browser"
	@echo ""
	@echo "  Testing"
	@echo "    make test        — run Playwright extension tests"
	@echo "    make test-report — open last Playwright HTML report"
	@echo ""
	@echo "  Shared"
	@echo "    make sync-tokens — sync design tokens from extension → webapp"
	@echo "    make design-audit — check every surface against DESIGN.md"
	@echo "    make clean       — remove build artifacts"
	@echo ""

# ── Webapp ────────────────────────────────────────────────────────────────────
dev:
	cd $(WEBAPP_DIR) && npm run dev

build:
	cd $(WEBAPP_DIR) && npm run build

start:
	cd $(WEBAPP_DIR) && npm run start

db-migrate:
	cd $(WEBAPP_DIR) && npm run db:migrate

# ── Testing ───────────────────────────────────────────────────────────────────
test:
	npm run test:yt

test-report:
	npx playwright show-report

# ── Shared ────────────────────────────────────────────────────────────────────
sync-tokens:
	npm run sync-tokens

# Source-level conformance. Add --dist (npm run design:audit:dist) after an
# ext-build to check the packaged artifact too.
design-audit:
	npm run design:audit

# ── Extension ─────────────────────────────────────────────────────────────────
ext-dev:
	cd $(EXT_DIR) && npm run dev

ext-build:
	cd $(EXT_DIR) && npm run build

# Package the BUILT extension (extension/dist) for the Chrome Web Store.
# Never zip the repo root: that ships the dev manifest (which loads src/*.js
# ES modules as classic content scripts and breaks on install), plus src/ and
# node_modules. Always rebuild dist first so the zip matches current source.
ext-zip: ext-build
	@rm -f $(ZIP_NAME)
	@test -f $(EXT_DIST)/manifest.json || { echo "✗ $(EXT_DIST)/manifest.json missing — run 'make ext-build'"; exit 1; }
	@cd $(EXT_DIST) && zip -r ../../$(ZIP_NAME) . \
		--exclude "*.DS_Store" \
		--exclude "__MACOSX/*" \
		--exclude "*.map"
	@echo "✓ $(ZIP_NAME) created from $(EXT_DIST)/"

ext-open:
	@open -a "Google Chrome" "chrome://extensions" 2>/dev/null || \
	 google-chrome "chrome://extensions" 2>/dev/null || \
	 google-chrome-stable "chrome://extensions" 2>/dev/null || \
	 chromium-browser "chrome://extensions" 2>/dev/null || \
	 echo "Open chrome://extensions manually and enable Developer Mode, then load $(EXT_DIR)/"

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	@rm -f $(ZIP_NAME)
	@rm -rf $(WEBAPP_DIR)/.next
	@echo "✓ cleaned"
