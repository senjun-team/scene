import logging
import requests
import json
from django.utils.timezone import now

from django.core.management.utils import get_random_secret_key

from .models import IdRecord, User

import scene.settings as settings

def post_request(api, body, params):
    # handyman url:
    url = "http://localhost:8080/" + api
    try:
        res = requests.post(url, params=params, json=body)
        if not res.ok:
            logging.warning(
                f"Request to handyman returned error: {res.status_code}"
            )
            return None

        return res.json()
    except Exception as e:
        logging.warning(f"Exception while requesting handyman: {e}")
        return None


def delete_user(username):
    try:
        user = User.objects.get(username=username)
        user_internal = IdRecord.objects.get(id_scene=username)

        if user_internal.id_bot is None:
            user_internal.delete()
        else:
            user_internal.id_scene = None
            user_internal.save()

        user.delete()
        return True
    except Exception as e:
        logging.warning(f"Couldn't delete user {username}: {e}")
        return False


def sync_progress(cur_id, old_id):
    res = post_request(
        "merge_users",
        {"cur_user_id": cur_id, "old_user_id": old_id, "new_user_id": 0},
        {},
    )
    if not res or res.get("status", None) != 0:
        return False
    return True


def unsync_progress(new_id, cur_id):
    res = post_request(
        "split_users", {"cur_user_id": cur_id, "new_user_id": new_id}, {}
    )
    if not res or res.get("status", None) != 0:
        return False
    return True


def get_user_id(username):
    """Returns internal anonymized user id"""
    try:
        rec, _ = IdRecord.objects.get_or_create(
            id_scene=username, defaults={"id_bot": None}
        )
        return rec.id
    except Exception as e:
        logging.warning(f"get_user_id {username} error: {e}")
        return None


def get_tg_bot_key(username):
    try:
        user = IdRecord.objects.get(id_scene=username)
        user.activation_key = get_random_secret_key()
        user.activation_key_dt = now()
        user.save()

        return user.activation_key
    except Exception as e:
        logging.warning(f"get_tg_bot_key {username} error: {e}")
        return ""


def get_user_id_for_bot(id_bot):
    """Returns internal anonymized user id for telegram chat bot"""
    if id_bot is None:
        return -1

    try:
        rec, _ = IdRecord.objects.get_or_create(
            id_bot=id_bot, defaults={"id_scene": None}
        )
        return rec.id
    except Exception as e:
        logging.warning(f"get_user_id_for_bot {id_bot} error: {e}")
        return -1


def is_key_expired(key_dt):
    is_expired = (now() - key_dt).total_seconds() > 24 * 60 * 60
    return is_expired


def sync_tg_bot(id_bot, activation_key):
    if id_bot is None:
        return -1

    try:
        user_bot = IdRecord.objects.get(id_bot=id_bot)
        user_scene = IdRecord.objects.get(activation_key=activation_key)

        if is_key_expired(user_scene.activation_key_dt):
            return 1

        is_ok = sync_progress(cur_id=user_bot.id, old_id=user_scene.id)
        if not is_ok:
            return -1

        id_scene = user_scene.id_scene
        user_scene.delete()

        user_bot.id_scene = id_scene
        user_bot.activation_key = None
        user_bot.activation_key_dt = None
        user_bot.save()

        return 0

    except IdRecord.DoesNotExist as e:
        logging.warning(f"sync_tg_bot id_bot={id_bot} user doesn't exist: {e}")
    except Exception as e:
        logging.warning(f"sync_tg_bot id_bot={id_bot} error: {e}")

    return -1


def delete_tg_bot_link_for_user(username):
    try:
        user = IdRecord.objects.get(id_scene=username)
        if user.id_bot is None:
            return -1

        user.id_scene = None
        user.save()

        user_scene = IdRecord(id_scene=username, id_bot=None)
        user_scene.save()

        if unsync_progress(new_id=user_scene.id, cur_id=user.id):
            return 0

    except Exception as e:
        logging.warning(f"delete_tg_bot_link_for_user {username} error: {e}")

    return -1

def delete_tg_bot_link_for_tg_bot_user(id_bot):
    try:
        user = IdRecord.objects.get(id_bot=id_bot)
        if user.id_scene is None:
            user.delete()
            return 0

        user.id_bot = None
        user.save()
        return 0

    except IdRecord.DoesNotExist as e:
        logging.warning(f"delete_tg_bot_link_for_tg_bot_user {id_bot} error during deletion: {e}")
        return 0
    except Exception as e:
        logging.warning(f"delete_tg_bot_link_for_tg_bot_user {id_bot} error: {e}")
    
    return -1

def course_sorter(course):
    status = course.get("status", "")

    if status == "in_progress":
        return 0
    if status == "not_started":
        return 1

    return 2


def get_courses_internal(status, params):
    courses = post_request("get_courses", {"status": status}, params)
    if courses is None:
        return []

    for course in courses:
        course["tags"] = json.loads(course["tags"])
        cid = course["course_id"]
        course["tags"]["authors"] = [a for a in settings.COURSE_AUTHORS[cid] if a.get("author") is not None]
        course["tags"]["edited_by"] = [a for a in settings.COURSE_AUTHORS[cid] if a.get("edited_by") is not None]


    courses.sort(key=course_sorter)
    return courses


def get_courses(user_id, status="all"):
    try:
        params = {"user_id": user_id} if user_id else {}
        return get_courses_internal(status, params)
    except Exception as e:
        logging.warning(f"Couldn't get courses for {user_id}, status {status}: {e}")
        if user_id is None:
            return []
        else:
            # If user_id is present, it could be some error with old coockies
            return get_courses_internal(status, {})


def get_courses_stats(user_id):
    return post_request("courses_stats", {}, {"user_id": user_id})


def run_user_task(user_id, run_task_body):
    return post_request("run_task", run_task_body, {"user_id": user_id})


def get_progress(user_id, body):
    return post_request("get_progress", body, {"user_id": user_id})


def get_chapters(user_id, course_id):
    body = {"course_id": course_id}

    params = {}
    if user_id:
        params["user_id"] = user_id

    return post_request("get_chapters", body, params)

def get_course_info(course_id):
    body = {"course_id": course_id}
    return post_request("get_course_info", body, {})
