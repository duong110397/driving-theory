# Production image (Render): builds the SPA, then serves it and the API from one Django process.
# Local development uses docker-compose.yml with backend/ and frontend/ Dockerfiles instead.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_FRONTEND_DIST=/app/public \
    DJANGO_MEDIA_ROOT=/app/public/media

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY --from=frontend /frontend/dist /app/public

# The host filesystem is ephemeral, so the dataset images are baked into the image as read-only
# media. import_questions sees them already in storage and only writes the DB rows.
RUN mkdir -p "$DJANGO_MEDIA_ROOT/questions" \
    && cp data/gplx600/images/* "$DJANGO_MEDIA_ROOT/questions/" \
    && DJANGO_SECRET_KEY=collectstatic-only DATABASE_URL=sqlite:////tmp/unused.db \
       python manage.py collectstatic --noinput

RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

# entrypoint.sh runs migrations and seeds the questions (Render's free plan has no pre-deploy step).
ENTRYPOINT ["./entrypoint.sh"]
# Shell form is needed to expand $PORT (set by Render); exec keeps gunicorn as PID 1 for signals.
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --access-logfile -"]
