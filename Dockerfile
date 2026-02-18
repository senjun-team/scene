# Multi-stage build для минимального размера production образа
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

# Устанавливаем компилятор и необходимые инструменты для сборки cffi, Pillow и других C-расширений
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libffi-dev \
    libjpeg-dev \
    zlib1g-dev

# Компиляция bytecode ускоряет первый запуск
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0 UV_COMPILE_BYTECODE=1
ENV PYTHONBUFFERED=1

WORKDIR /app

# Зависимости устанавливаются отдельно для лучшего кеширования слоев
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev



COPY scene/ /app/scene
RUN uv run python /app/scene/manage.py collectstatic --no-input


FROM python:3.13-slim-bookworm

# curl нужен для healthcheck в docker-compose.yml
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y \
    curl

# Non-root user снижает риски безопасности
RUN groupadd --system --gid 999 scene \
 && useradd --system --gid 999 --uid 999 scene

COPY --from=builder --chown=scene:scene /app/staticfiles /app/scene/staticfiles
COPY --from=builder --chown=scene:scene /app /app

ENV PATH="/app/.venv/bin:$PATH"

USER scene

WORKDIR /app/scene

EXPOSE 80

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "3", "scene.wsgi:application"]
