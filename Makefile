.DEFAULT_GOAL := help

.PHONY: *

help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z\/_%-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

install: ## Install all dependencies
	pnpm install --frozen-lockfile
	cd app && pnpm setup-vendors

dev: ## Start development server
	cd app && pnpm tauri dev

build: ## Build production app
	cd app && pnpm tauri build

build/%: ## Build for specific target (e.g., build/x86_64-apple-darwin)
	cd app && pnpm tauri build --target $*

clean: ## Remove all build artifacts
	rm -rf app/.next app/out node_modules app/node_modules packages/foliate-js/node_modules
	cd app/src-tauri && cargo clean

fmt: ## Format all code
	cd app && pnpm lint --fix || true
	cd app/src-tauri && cargo fmt

##@ Testing/Linting

can-release: lint ## Run all CI checks (lint)

lint: lint/frontend lint/backend ## Run all linting

lint/frontend: ## Lint TypeScript/React code
	cd app && pnpm lint

lint/backend: ## Lint Rust code
	cd app/src-tauri && cargo fmt --check
	cd app/src-tauri && cargo clippy -- -D warnings
