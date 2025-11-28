import requests
import logging
from datetime import datetime

from django.http import JsonResponse

import scene.settings as settings
from . import communications as c


def communicate_bot(msg, files):
    if len(files) > 5:
        return JsonResponse({"status": 1})

    for file in files:
        if file.size >= 10000000:  # 10 mb
            return JsonResponse({"status": 1})

    bot = TGBot(settings.INFRA_TG_BOT_TOKEN, settings.INFRA_TG_BOT_CHANNEL_ID)

    if not bot.send_message(msg):
        return JsonResponse({"status": 2})

    for file in files:
        if file.content_type.startswith("image/"):
            if not bot.send_image(file):
                return JsonResponse({"status": 2})
            continue

        if file.content_type.startswith("video/"):
            if not bot.send_video(file):
                return JsonResponse({"status": 2})
            continue

        if not bot.send_document(file):
            return JsonResponse({"status": 2})

    return JsonResponse({"status": 0})


# https://core.telegram.org/bots/api#senddocument
class TGBot:
    def __init__(self, token, chat_id):
        self._url = f"https://api.telegram.org/bot{token}/"
        self._chat_id = chat_id
        self._cur_msg_id = None

    def _send(self, api, payload, files=None):
        resp = requests.post(
            url=f"{self._url}{api}", data=payload, files=files
        )

        if not resp.ok:
            try:
                tg_resp = resp.json()
            except Exception:
                tg_resp = {}

            logging.warning(f"Couldn't communicate with tg api {api}. {resp} {tg_resp}. Payload: {payload}")
            return False

        tgm_msg = resp.json()

        if not tgm_msg.get("ok"):
            logging.warning(
                f"Error communicating with tg api {api}: {tgm_msg}"
            )
            return False

        if (
            not "result" in tgm_msg
            or tgm_msg["result"].get("message_id") is None
        ):
            logging.warning(
                f"Error parsing response for tg api {api}: {tgm_msg}"
            )
            return False

        if not self._cur_msg_id:
            self._cur_msg_id = tgm_msg["result"]["message_id"]

        return True

    def _send_file(self, file, fileType):
        files = {fileType: file.read()}

        payload = {
            "chat_id": self._chat_id,
            "reply_to_message_id": self._cur_msg_id,
            "caption": file.name,
        }

        return self._send(f"send{fileType.capitalize()}", payload, files)

    def send_message(self, text):
        payload = {
            "chat_id": self._chat_id,
            "text": text,
        }
        return self._send("sendMessage", payload)

    def send_image(self, file):
        return self._send_file(file, "photo")

    def send_video(self, file):
        return self._send_file(file, "video")

    def send_document(self, file):
        return self._send_file(file, "document")


def parse_chapter_url(url):
    arr = url.split("/")

    if url.find("chapters") != -1:
        i = arr.index("chapters")
    else:
        i = arr.index("practice")
    return arr[arr.index("courses") + 1], arr[i + 1]


def get_message(request):
    user = request.user

    course_id, chapter_id = parse_chapter_url(request.POST.get("url"))

    try:
        if user.is_authenticated:
            user_id = c.get_user_id(user.username)
        else:
            user_id = "отсутствует, пользователь не залогинен"
    except Exception as e:
        user_id = "не определен"
        logging.warning(f"Couldn't get user id for {user.username}: {e}")

    msg_template = """
Пользователь {} (id {}) оставил отзыв {}.

Курс: {}
Глава: {} (id {})

Отзыв:
{}
"""

    msg = msg_template.format(
        user.username if user.is_authenticated else request.POST.get("email"),
        user_id,
        datetime.now(),
        course_id,
        request.POST.get("chapter"),
        chapter_id,
        request.POST.get("feedback_form"),
    )
    return msg
