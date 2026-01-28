# Scene

Веб-интерфейс senjun.ru.

## Перед запуском

Для полноценной работы сайта нужно, чтобы рядом работали сервисы [handyman](https://github.com/senjun-team/handyman) и [watchman_cpp.](https://github.com/senjun-team/watchman_cpp)

## Настройка проекта

Склонировать проект:

```bash
git clone https://github.com/senjun-team/scene.git
```

Настроить окружение:

```bash
cd scene
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt
```

Создать свой конфиг и заполнить его значениями:

```bash
cd scene
cp conf-template.json conf.json
```

Внутри `conf.json` как минимум нужно задать свой пароль для бд, с которой работает проект. В отладочных целях другие поля кастомизировать не обязательно.

Для работы проекту требуедся бд.  Можно поднять PostgreSQL в докере:

```bash
docker run  -e POSTGRES_PASSWORD=senjun_pass -p 5432:5432 -v postgres-senjun-data:/var/lib/postgresql/data -d postgres
```

Заходим внутрь контейнера, запускаем `psql`

```bash
docker exec -it CONTAINER_ID bash
psql -U postgres
```

Создаем бд для проекта:

```psql
CREATE DATABASE scene;
CREATE USER scene WITH password 'scene';
ALTER ROLE scene SET client_encoding TO 'utf8';
ALTER ROLE scene SET default_transaction_isolation TO 'read committed';
ALTER ROLE scene SET timezone TO 'UTC';
ALTER DATABASE scene OWNER TO scene;
GRANT ALL PRIVILEGES ON DATABASE scene TO scene;
```

Проводим миграцию табличек:

```bash
cd ..
python manage.py makemigrations
python manage.py migrate
```

Настраиваем кеш. Он нужен для рейт-лимита на аутентификационные апи:

```bash
python3 manage.py createcachetable
```

Создаем пользователя, под которым можно будет логиниться на сайте:

```bash
cd scene
python3 manage.py shell
```

Попав в шел джанги, пишем:

```python
from django.contrib.auth.models import User
user = User.objects.create_user(username='login', email='mail@example.com', password='password')
user.save()
```

После этого запускаем проект:

```bash
python3 manage.py runserver --insecure 127.0.0.1:8001
```

По адресу `http://127.0.0.1:8001/` открывается сайт. Можно логиниться.

## Запросы для телеграм бота
Получение внутреннего id пользователя:
```bash
curl -X POST   -d '{"key":"key_from_conf", "user_id":522727992}'   "http://127.0.0.1:8001/v1/get_user_id/telegram_bot/"
```

Синхронизация учеток пользователя в боте и на сайте:
```bash
curl -X POST   -d '{"key":"key_from_conf", "user_id":522727992, "activation_key":"9c7kjbb-_l6)rt6%mf1p$p#z*81a2in04!2w)%wuo65we)=0mh"}'   "http://127.0.0.1:8001/sync_tg_bot_with_site/"
```

При синхронизации внутренний id пользователя в боте не изменится. Изменится внутренний id пользователя на сайте. В качестве "user_id" нужно передавать айди пользователя из телеграма (не внутренний).

Варианты ответов:
- Пустой json. Какая-то ошибка, скорее всего связанная с попытками опрокинуть сцену.
- `{"status":0}` - json с полем status. Если status=0, то все ок и синхронизация произошла успешно. Нужно перезапросить новый внутрнний id пользователя. Если 1, то `activation_key` заэкспайрился (ему больше суток). Другие коды - опять же какая-то ошибка, скорее всего связанная с опрокидыванием.
