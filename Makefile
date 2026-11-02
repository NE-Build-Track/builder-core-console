.PHONY: install check typecheck lint test build dev gen-api images up down logs compose-config restart-payments

COMPOSE := docker compose -f deploy/compose.yaml

install:
	cd web && pnpm install --frozen-lockfile

typecheck:
	cd web && pnpm typecheck

lint:
	cd web && pnpm lint

test:
	cd web && pnpm test

compose-config:
	$(COMPOSE) config -q
	touch deploy/keycloak/.env && docker compose -f deploy/keycloak/compose.yaml config -q

check: typecheck lint test compose-config

build:
	cd web && pnpm build

gen-api:
	cd web && pnpm gen:api

# One console per worktree (docs/RELIABILITY.md#per-worktree-dev): its own port from the folder name.
WORKTREE := $(notdir $(CURDIR))
PORT ?= $(shell python3 -c 'import zlib; print(3100 + zlib.crc32(b"$(WORKTREE)") % 800)')
dev:
	cd web && pnpm exec next dev --port $(PORT)

images:
	scripts/build-images.sh

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

# The signer and its metrics relay share clearinghouse's network namespace: recreate them whenever it restarts (deploy/README.md#operating).
restart-payments:
	$(COMPOSE) restart clearinghouse
	$(COMPOSE) up -d --no-build --pull never --force-recreate signer signer-metrics
