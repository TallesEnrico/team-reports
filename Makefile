.PHONY: run deploy --noproxy

PUBLIC_ORIGIN := https://teamreports.com.br

run:
	bun run dev:tunnel $(if $(filter --noproxy,$(MAKECMDGOALS)),-- --noproxy)

deploy:
	VITE_JIRA_WRITE_PROXY_URL=$(PUBLIC_ORIGIN) bun run build
	bun run --cwd proxy deploy

--noproxy:
	@:
