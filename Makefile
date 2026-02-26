.PHONY: up down migrate seed backend-dev worker-dev

# Start all services
up:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Start only DB + Redis (for local dev)
infra:
	docker compose up -d db redis

# Run Alembic migrations
migrate:
	cd backend && alembic upgrade head

# Generate new migration
migration:
	cd backend && alembic revision --autogenerate -m "$(msg)"

# Run seed data
seed:
	cd backend && python -m app.seed.growth4u
	cd backend && python -m app.seed.prompts_es

# Run backend locally (dev)
backend-dev:
	cd backend && uvicorn app.main:app --reload --port 8000

# Run Celery worker locally
worker-dev:
	cd backend && celery -A app.celery_app worker --loglevel=info --concurrency=2

# Run frontend locally
frontend-dev:
	cd frontend && npm run dev
