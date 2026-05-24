# Clipmark — dev commands
# Usage: make <target>

.PHONY: help dev build start migrate sync-tokens ext-dev ext-build ext-zip ext-open test test-report clean

WEBAPP_DIR := webapp
EXT_DIR    := extension
DIST_DIR   := dist
ZIP_NAME   := clipmark-extension.zip

# ── Default ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Clipmark commands"
	@echo ""
	@echo "  Webapp"
	@echo "    make dev        — next dev (hot reload)"
	@echo "    make build      — migrate + next build"
	@echo "    make start      — next start (production)"
	@echo "    make migrate    — run DB migrations"
	@echo ""
	@echo "  Extension"
	@echo "    make ext-dev    — run extension in dev mode (HMR)"
	@echo "    make ext-build  — build extension with Vite"
	@echo "    make ext-zip    — zip dist folder for Chrome Web Store"
	@echo "    make ext-open   — open chrome://extensions in default browser"
	@echo ""
	@echo "  Testing"
	@echo "    make test        — run Playwright extension tests"
	@echo "    make test-report — open last Playwright HTML report"
	@echo ""
	@echo "  Shared"
	@echo "    make sync-tokens — sync design tokens from extension → webapp"
	@echo "    make clean       — remove build artifacts"
	@echo ""

# ── Webapp ────────────────────────────────────────────────────────────────────
dev:
	cd $(WEBAPP_DIR) && npm run dev

build:
	cd $(WEBAPP_DIR) && npm run build

start:
	cd $(WEBAPP_DIR) && npm run start

migrate:
	cd $(WEBAPP_DIR) && npm run migrate

# ── Testing ───────────────────────────────────────────────────────────────────
test: ext-build
	npm run test:yt

test-report:
	npx playwright show-report

# ── Shared ────────────────────────────────────────────────────────────────────
sync-tokens:
	npm run sync-tokens

# ── Extension ─────────────────────────────────────────────────────────────────
ext-dev:
	npm run dev

ext-build:
	npm run build

ext-zip: ext-build
	@rm -f $(ZIP_NAME)
	@cd $(DIST_DIR) && zip -r ../$(ZIP_NAME) . \
		--exclude "*.DS_Store" \
		--exclude "__MACOSX/*"
	@echo "✓ $(ZIP_NAME) created from $(DIST_DIR)"

ext-open:
	@open -a "Google Chrome" "chrome://extensions" 2>/dev/null || \
	 google-chrome "chrome://extensions" 2>/dev/null || \
	 google-chrome-stable "chrome://extensions" 2>/dev/null || \
	 chromium-browser "chrome://extensions" 2>/dev/null || \
	 echo "Open chrome://extensions manually and enable Developer Mode, then load $(DIST_DIR)/"

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	@rm -f $(ZIP_NAME)
	@rm -rf $(DIST_DIR)
	@rm -rf $(WEBAPP_DIR)/.next
	@echo "✓ cleaned"
