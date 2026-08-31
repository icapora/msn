.DEFAULT_GOAL := help
.PHONY: help install start demo test test-coverage lint format check doctor hook hook-dry unhook unhook-dry

## help: list every target
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | \
		awk -F': ' '{ target = substr($$1, 4); $$1 = ""; printf "  make %-16s%s\n", target, substr($$0, 2) }'

## install: fetch the dev tooling (there are no runtime dependencies)
install:
	npm install

## start: serve the viewer on port 4646
start:
	node src/server.mjs

## demo: serve fictional sessions and messages, with sending disabled
demo:
	node scripts/demo.mjs

## test: run the whole suite
test:
	node --test

## test-coverage: run the suite with coverage
test-coverage:
	node --test --experimental-test-coverage

## lint: check the source with eslint
lint:
	npx eslint .

## format: rewrite files with prettier
format:
	npx prettier --write .

## check: everything CI enforces
check:
	npx eslint .
	npx prettier --check .
	node --test

## doctor: check Claude Code version, platform, hook, log and sockets
doctor:
	node scripts/doctor.mjs

## hook-dry: show the settings.json diff without writing it
hook-dry:
	node scripts/install.mjs

## hook: install the capture hook
hook:
	node scripts/install.mjs --apply

## unhook-dry: show what removing the hook would change
unhook-dry:
	node scripts/uninstall.mjs

## unhook: remove the capture hook
unhook:
	node scripts/uninstall.mjs --apply
