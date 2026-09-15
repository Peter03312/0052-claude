.PHONY: help web verify verify-shell test build

help:
	@echo "make web      —— 构建并以后台方式运行静态 web（默认 8080，APP_PORT 可覆盖）"
	@echo "make verify   —— 在 Docker 里一次性运行验收：类型/单测/构建/首页冒烟"
	@echo "make test     —— 本地跑 Vitest 单元测试"
	@echo "make build    —— 本地生产构建"

web:
	docker compose up --build

verify:
	docker compose --profile verify run --rm --build verify

verify-shell:
	docker compose --profile verify run --rm --entrypoint sh verify

test:
	npm run test:unit

build:
	npm run build
