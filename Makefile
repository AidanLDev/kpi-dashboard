.PHONY: deploy deploy-web deploy-infra check help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

check: ## Run quality checks (lint, format, tests)
	@echo "No checks configured yet"

deploy: deploy-infra deploy-web ## Deploy infrastructure then web

deploy-web: ## Build and deploy the frontend to S3/CloudFront
	@bash scripts/ci/deploy-web.sh

deploy-infra: ## Deploy CDK infrastructure if changes detected
	@bash scripts/ci/deploy-infra.sh
