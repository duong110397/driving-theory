#!/bin/sh
set -e

python manage.py migrate --noinput
# Seed the question bank on first start; a no-op once questions exist.
python manage.py import_questions --if-empty

exec "$@"
