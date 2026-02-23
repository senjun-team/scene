import logging
import json
import uuid
import copy

import os.path
import io
import zipfile
from django.shortcuts import render

from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.template.loader import render_to_string
from .tokens import account_activation_token
from django.contrib.auth.models import User
from django.contrib.auth import login as django_login
from django.contrib.auth.decorators import login_required
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags
from django.shortcuts import redirect
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.cache import cache_control
from .models import SignupForm, LoginForm, IdRecord
from . import communications as c
from . import communications_bot as cb
from scene import settings

# from .users_whitelist import user_in_whitelist

def is_inner_request(request):
    # this is not header. This is the value of $remote_addr set by nginx
    if request.META.get("HTTP_X_REAL_IP", "") in ["127.0.0.1", "0.0.0.0"]:
        return True
    
    return False

def normalize_title(title):
    if title == "go":
        return "golang"
    if title == "c++":
        return "cpp"
    return title

@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def main(request):
    user_id = None
    user = request.user

    if user.is_authenticated:
        user_id = c.get_user_id(user.username)

    context = {"courses_list": c.get_courses(user_id)}
    return render(request, "index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def playground(request, lang_id):
    try:
        # playground_id = request.GET.get("id", "")
        lang_id = normalize_title(lang_id)
        project = request.session.pop("project", settings.PLAYGROUND_PROJECTS[lang_id])

        context = {
        "lang_id": lang_id,
        "lang_title": get_lang_title(lang_id),
        "lang_version": "",
        "project_contents_raw": project
        }

        return render(request, "playground/index.html", context)

    except Exception as e:
        logging.exception(f"Exception in playground: {e}")


def get_lang_title(lang_id):
    if lang_id == "cpp":
        return "C++"
    return lang_id.capitalize()


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def playgrounds(request):
    playgrounds_list = [{"lang_id": lang_id, "title": get_lang_title(lang_id)} for lang_id in ["python", "golang", "rust", "cpp", "haskell"]
        ]
    context = {"playgrounds_list": playgrounds_list}
    return render(request, "playgrounds/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def run_code(request):
    try:
        if request.method != "POST":
            return JsonResponse({"status": 1})
        
        user = request.user
        user_data = {}
        if user.is_authenticated:
            user_id = c.get_user_id(user.username)
            user_data = {"user_id": user_id}
        
        body = {}
        body["lang_id"] = request.POST["lang_id"]
        body["project"] = request.POST["project"]
        body["playground_id"] = request.POST.get("playground_id", str(uuid.uuid4()))

        res = c.post_request(
            "run_code",
            body,
            user_data,
        )

        res["playground_id"] = body["playground_id"]

        return JsonResponse(res)
    except Exception as e:
        logging.exception(f"Couldn't finish /run_code: {e}")
        return JsonResponse({"status_code": 1})


def replace_main_file_contents(project, lang_id, user_code):
    if lang_id == "python":
        project["children"][0]["contents"] = user_code
        return
    
    if lang_id == "rust":
        for item in project["children"]:
            if item["name"] == "src":
                item["children"][0]["contents"] = user_code
                return
    
    if lang_id == "haskell":
        for item in project["children"]:
            if item["name"] == "app":
                item["children"][0]["contents"] = user_code
                return
    
    if lang_id == "golang":
        for item in project["children"]:
            if item["name"] == "cmd":
                item["children"][0]["contents"] = user_code
                return
    
    if lang_id == "cpp":
        for item in project["children"]:
            if item["name"] == "main.cpp":
                item["contents"] = user_code
                return

    logging.error(f"Couldn't replace main file with contents: {lang_id}")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def create_playground(request):
    try:
        user = request.user
        user_id = c.get_user_id(user.username)

        body = json.loads(request.body.decode("utf-8"))
        if "lang_id" not in body or "user_code" not in body or "task_id" not in body:
            return JsonResponse({"status_code": 1})

        lang_id = normalize_title(body["lang_id"])

        res = c.post_request(
            "inject_playground_code",
            {
                "task_id": body["task_id"],
                "solution_text": body["user_code"] if len(body["user_code"]) > 0 else " ",
                "example_id": body.get("example_id", "")
            },
            {"user_id": user_id},
        )

        if not res or "user_code" not in res:
            return JsonResponse({"status_code": 2})
        

        project = json.loads(settings.PLAYGROUND_PROJECTS[lang_id])
        replace_main_file_contents(project, lang_id, res["user_code"])

        request.session["project"] = json.dumps(project)
        return JsonResponse({"status_code": 0, "url": f"/playground/{body['lang_id']}/"}) # ?id={body['playground_id']}

    except Exception as e:
        logging.exception(f"Couldn't handle create playground request: {e}")
        return JsonResponse({"status_code": 3})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def download_project(request):
    try:
        body = json.loads(request.body.decode("utf-8"))
        if len(body) != 3 or "lang_id" not in body or "project_contents" not in body or "project_name" not in body:
            return JsonResponse({"status_code": 1})

        request.session["download_project"] = json.dumps(body)
        return JsonResponse({"status_code": 0, "url": f"/download_project_archive/"})

    except Exception as e:
        logging.exception(f"Couldn't handle download_project request: {e}")
        return JsonResponse({"status_code": 3})


def write_to_arch(arch, obj, path_to_obj):
    try:
        name = os.path.join(path_to_obj, obj["name"])

        if obj.get("children") is not None: # directory
            for child in obj["children"]:
                write_to_arch(arch, child, name)

            return
        
        arch.writestr(name, obj["contents"])
    except Exception as e:
        logging.exception(f"obj: {json.dumps(obj)} path: {path_to_obj} {e}")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def download_project_archive(request):
    try:
        project = json.loads(request.session.pop("download_project", ""))
        filename = project["project_name"]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as zf:
            write_to_arch(zf, json.loads(project["project_contents"]), "")

        response = HttpResponse(buffer.getvalue())
        response['Content-Type'] = 'application/x-zip-compressed'
        response['Content-Disposition'] = f'attachment; filename={filename}.zip'
        return response

    except Exception as e:
        logging.exception(f"Couldn't handle download_project_archive request: {e}")
        return JsonResponse({"status_code": 3})


def get_playground_code(user, playground_id):
    try:
        user_data = {}
        if user.is_authenticated:
            user_id = c.get_user_id(user.username)
            user_data = {"user_id": user_id}

        res = c.post_request(
            "get_playground_code",
            {"playground_id": playground_id},
            user_data,
        )
        
        if res and "user_code" in res:
            return res["user_code"]
        
        return None
    except Exception as e:
        logging.exception(f"Couldn't handle get playground code request: {e}")
        return None
    

@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def courses(request):
    user_id = None
    user = request.user
    if user.is_authenticated:
        user_id = c.get_user_id(user.username)

    context = {"courses_list": c.get_courses(user_id)}
    return render(request, "courses/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def author(request, author):
    with open(
        os.path.join(settings.STATIC_ROOT, "courses/authors/authors.json"), "r"
    ) as f:
        author_data = json.load(f)

    context = {"author": author, "data": author_data[author]}
    return render(request, "author/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def authors(request):
    with open(
        os.path.join(settings.STATIC_ROOT, "courses/authors/authors.json"), "r"
    ) as f:
        author_data = json.load(f)

    for k in author_data.keys():
        author_data[k]["author_id"] = k

    sorted_authors = sorted(author_data.values(), key=lambda a: a["full_name"])

    context = {"authors": sorted_authors}
    return render(request, "authors/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def send_feedback(request):
    if request.method != "POST":
        return JsonResponse({"status": 1})

    try:
        msg = cb.get_message(request)
        if msg is None:
            return JsonResponse({"status": 1})

        files = request.FILES.getlist("attachments") if request.FILES else []
        return cb.communicate_bot(msg, files)
    except Exception as e:
        logging.warning(f"Exception in send_feedback: {e}")
        return JsonResponse({"status": 1})


def build_subchapters_hierarchy(chapters):
    parents = {} # parent id to chapters list
    chapters_to_delete = []

    for c in chapters:
        cid = c["chapter_id"]
        if c["chapter_id"][-1] == '0' and "chapter_" in c["chapter_id"]: # parent chapter
            continue

        if "chapter" not in c["chapter_id"]: # practice
            continue

        pid = cid[:-1] +'0'

        if pid not in parents:
            parents[pid] = []
        
        parents[pid].append(copy.deepcopy(c))
        chapters_to_delete.append(cid)

    for c in chapters:
        cid = c["chapter_id"]
        if cid in parents:
            c["subchapters"] = parents[cid]

    res_chapters = []

    for c in chapters:
        if c["chapter_id"] not in chapters_to_delete:
            res_chapters.append(copy.deepcopy(c))
    
    return res_chapters


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def course(request, course_id):
    user = request.user

    user_id = None
    if user.is_authenticated:
        user_id = c.get_user_id(user.username)

    res = c.get_chapters(user_id, course_id)
    if res is None or len(res) < 1:
        logging.error(
            f"Couldn't get chapters on course {course_id} for user {user.username}: {res}"
        )
        return redirect("/error")

    try:
        tags = c.get_course_info(course_id)
        if tags is None or len(tags) < 1:
            logging.error(f"Couldn't get info on course {course_id}: {tags}")
            return redirect("/error")
        tags = json.loads(tags["tags"])
        in_development = tags.get("in_development", False)
        tags["authors"] = [a for a in settings.COURSE_AUTHORS[course_id] if a.get("author") is not None]
        tags["edited_by"] = [a for a in settings.COURSE_AUTHORS[course_id] if a.get("edited_by") is not None]

        for chapter in res:
            chapter["title"] = chapter["title"].replace("Глава ", "")

        chapters = build_subchapters_hierarchy(res)
        
        course = {}
        if user_id is not None:
            res = c.post_request("course_stats", {"course_id": course_id}, {"user_id": user_id})
            if res is not None and "error" not in res and len(res) > 0:
                course = res[0]
                calc_progress(course)

        res = c.post_request("get_course_description", {"course_id": course_id}, {})
        if res is not None and "description" in res:
            tags["description"] = res["description"]

        context = {
            "chapters_list": chapters,
            "course_id": course_id,
            "course_title": tags.get("title", course_id.capitalize()),
            "in_development": in_development,
            "course": course,
            "tags": tags
        }

        return render(request, "course/index.html", context)
    except Exception as e:
        logging.exception(f"Exception in course {course_id}: {e}")


def extract_chapter_title(title):
    if title.startswith("Глава") and (i := title.rfind(".")) != -1:
        return title[i+2:]
    return title


def extract_chapter_page_title(title, course_title):
    if title.startswith("Глава") and (i := title.rfind(".")) != -1:
        return f"{title[i+2:]} | {course_title}. {title[:i]}"
    return f"{title} | {course_title}"

def extract_description(text):
    try:
        max_len = min(1000, len(text))
        lines = text[:max_len].split('\n')
        res = []
        has_citation = False

        for l in lines:
            l = l.strip()

            if len(l) < 2:
                continue
            
            if l.startswith(">"):
                has_citation = True
                continue
            
            if has_citation:
                has_citation = False
                continue

            if l.startswith("##") or l.startswith("`"):
                break

            if l.startswith("#"):
                continue

            res.append(l.replace("`", ""))

        return "\n".join(res)
    except Exception as e:
        logging.exception(f"Couldn't prepare description")
        return ""


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def practice(request, course_id, project_id):
    user = request.user

    user_id = None
    if user.is_authenticated:
        user_id = c.get_user_id(user.username)

    res = c.post_request(
        "get_practice", {"course_id": course_id, "task_id": project_id}, {"user_id": user_id}
    )

    if res is None or "title" not in res or "project_path" not in res:
        logging.error(
            f"Couldn't get practice project {project_id} on course {course_id} for user {user.username}: {res}"
        )
        return redirect("/error")

    try:
        context = {
            "title": res["title"],
            "course_id": course_id,
            "default_cmd_line_args": res.get("default_cmd_line_args", ""),
            "course_title": json.loads(res["tags"]).get("title", course_id.capitalize()),
            "project_id": project_id,
            "status": res["status"],
            "project_description": "\n" + res["project_description"],
            "project_hint": "\n" + res["project_hint"],
            "next_chapter_id": res["next_chapter_id"]
        }

        project = {}
        settings.get_project_structure(project, res["project_path"], res["main_file"])
        context["project_contents_raw_default"] = json.dumps(project)

        context["project_contents_raw"] = res["project"] if len(res.get("project", "")) > 10 else context["project_contents_raw_default"]

        return render(request, "practice/index.html", context)
    except Exception as e:
        logging.exception(
            f"Exception on practice {project_id} on course {course_id} for user {user.username}"
        )
        return redirect("/error")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def handle_practice_code(request):
    try:
        user = request.user
        user_id = c.get_user_id(user.username)
        body = json.loads(request.body.decode("utf-8"))

        return JsonResponse(c.post_request("handle_practice_code", body, {"user_id": user_id}))

    except Exception as e:
        logging.exception("Couldn't finish handle_practice_code call")
        return JsonResponse({"status_code": 4})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def chapter(request, course_id, chapter_id):
    user = request.user
    user_id = None
    if user.is_authenticated:
        user_id = c.get_user_id(user.username)

    res = c.post_request(
        "get_chapter", {"chapter_id": chapter_id}, {"user_id": user_id}
    )

    if res is None or "chapter_id" not in res:
        logging.warning(
            f"Couldn't get chapter on course {course_id} for user {user.username}: {res}"
        )
        return redirect("/error")

    tags = c.get_course_info(course_id)
    if tags is None or len(tags) < 1:
        logging.warning(f"Couldn't get info on course {course_id}: {tags}")
        return redirect("/error")

    tags = json.loads(tags["tags"])
    in_development = tags.get("in_development", False)

    context = res
    context["content"] = "\n" + context["content"]
    context["course_id"] = course_id
    context["course_title"] = tags.get("title", course_id.capitalize())
    context["chapter_id"] = chapter_id
    context["in_development"] = in_development

    context["description"] = extract_description(context["content"])

    if "title" in context:
        context["page_title"] = extract_chapter_page_title(context["title"], context["course_title"])
        context["title"] = extract_chapter_title(context["title"])
    
    return render(request, "chapter/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def start_course(request, course_id):
    user = request.user
    user_id = c.get_user_id(user.username)

    res = c.post_request(
        "update_course_progress",
        {"course_id": course_id, "status": "in_progress"},
        {"user_id": user_id},
    )
    if res is None or (res.get("status", "") != "ok" and res.get("status", "") !=  "no_action"):
        logging.warning(
            f"Couldn't start course {course_id} for user {user.username}"
        )
        return redirect("/error")

    chapter_id = f"{course_id}_chapter_0010"

    res = c.post_request(
        "update_chapter_progress",
        {"chapter_id": chapter_id, "status": "in_progress"},
        {"user_id": user_id},
    )
    if res is not None and res.get("status" "") == "no_action":
        return redirect(f"/courses/{course_id}/chapters/{res['chapter_id']}/")

    if res is None or res.get("status", "") != "ok":
        logging.warning(
            f"Couldn't update progress on course {course_id} for user {user.username}"
        )
        return redirect("/error")

    return redirect(f"/courses/{course_id}/chapters/{chapter_id}/")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def current_chapter(request, course_id):
    user = request.user
    user_id = c.get_user_id(user.username)

    res = c.post_request(
        "get_active_chapter", {"course_id": course_id}, {"user_id": user_id}
    )

    if res is None or "chapter_id" not in res:
        return redirect(f"/courses/{course_id}/")
        
    chapter_id = res["chapter_id"]
    if res.get("is_practice", False):
        return redirect(f"/courses/{course_id}/practice/{chapter_id}/")
    
    return redirect(f"/courses/{course_id}/chapters/{chapter_id}/")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def signup(request):
    if request.method == "POST":
        form = SignupForm(request.POST)

        if form.is_valid():
            email = form.cleaned_data.get("email")
            existing_users = User.objects.filter(email=email)
            if len(existing_users) != 0:
                form.add_error(
                    "email", "Этот почтовый адрес уже занят. Попробуйте другой"
                )
                return render(request, "signup.html", {"form": form})

            # save form in the memory not in database
            user = form.save(commit=False)
            user.is_active = False
            user.save()

            try:
                mail_subject = "SenJun: подтверждение регистрации"
                html_message = render_to_string(
                    "acc_active_email.html",
                    {
                        "user": user,
                        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
                        "token": account_activation_token.make_token(user),
                    },
                )

                msg = EmailMultiAlternatives(
                    mail_subject,
                    strip_tags(html_message),
                    settings.DEFAULT_FROM_EMAIL,
                    [email],
                )
                msg.attach_alternative(html_message, "text/html")
                msg.send()
                return redirect(f"/courses/?status=registered&email={email}")

            except Exception as e:
                logging.exception(f"Couldn't send e-mail: {e}")
                form.add_error(
                    None,
                    "Ошибка при отправке письма для подтверждения регистрации. Пожалуйста, попробуйте повторить попытку чуть позже.",
                )
                user.delete()

            return render(request, "signup.html", {"form": form})
    else:
        form = SignupForm()

    return render(request, "signup.html", {"form": form})


def csrf_failure(request, reason=""):
    logging.error(f"csrf_failure: {reason}")
    return redirect(request.GET.get("next", "/courses/"))
    # return render(request, "csrf_failure.html", {})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def login(request):
    if request.method == "POST":
        form = LoginForm(request.POST)
        if form.is_valid():
            user = form.login(request)
            if user is not None:
                django_login(request, user)
                return redirect(request.GET.get("next", "/courses/"))

        return render(request, "login.html", {"form": form})

    form = LoginForm()
    return render(request, "login.html", {"form": form})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def activate(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (
        Exception
    ) as e:  # TypeError, ValueError, OverflowError, User.DoesNotExist
        user = None
        logging.exception(f"Couldn't activate account: {e}")

    if user is not None and account_activation_token.check_token(user, token):
        user.is_active = True
        user.save()
        try:
            id_record = IdRecord(id_scene=user.get_username(), id_bot=None)
            id_record.save()

            return redirect("/courses/?status=confirmed")
        except Exception as e:
            logging.exception(f"Couldn't create id record for account: {e}")

    return redirect("/courses/?status=reg_err")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def user(request):
    user = request.user
    context = {"login": user.username, "email": user.email}

    try:
        u = IdRecord.objects.get(id_scene=user.username)
        if (
            u.activation_key is not None
            and len(u.activation_key) > 0
            and u.activation_key_dt is not None
            and not c.is_key_expired(u.activation_key_dt)
        ):
            context["telegram_code"] = u.activation_key
        elif u.id_bot is not None:
            context["telegram_login"] = True

        
    except Exception as e:
        logging.warning(f"user err: {e}")

    return render(request, "user.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def delete_account(request):
    user = request.user

    if request.method == "POST":
        c.delete_user(user.username)
        return redirect("/accounts/logout/")

    context = {"login": user.username}
    return render(request, "delete_account.html", context)


def calc_progress(course):
    if (t := course.get("total_chapters", 0)) > 0:
        course["chapters_pct"] = int(course["finished_chapters"] * 100 / t)
    else:
        course["chapters_pct"] = 0

    if (t := course.get("total_tasks", 0)) > 0:
        course["tasks_pct"] = int(course["finished_tasks"] * 100 / t)
    else:
        course["tasks_pct"] = 0

    if (t := course.get("total_projects", 0)) > 0:
        course["projects_pct"] = int(course["finished_projects"] * 100 / t)
    else:
        course["projects_pct"] = 0


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def progress(request):
    user = request.user

    user_id = c.get_user_id(user.username)

    courses_in_progress = []
    courses_finished = []

    res = c.get_courses_stats(user_id)
    if res is None or "error" in res:
        return redirect ("/error")

    for course in res:
        calc_progress(course)

        if course["status"] == "in_progress":
            courses_in_progress.append(course)
        elif course["status"] == "completed":
            courses_finished.append(course)

    context = {
        "progress": True,
        "courses_in_progress": courses_in_progress,
        "courses_finished": courses_finished,
    }
    return render(request, "progress/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def run_task(request):
    try:
        user = request.user
        user_id = c.get_user_id(user.username)
        body = json.loads(request.body.decode("utf-8"))

        return JsonResponse(c.run_user_task(user_id, body))
    except Exception as e:
        logging.exception(f"Couldn't finish /run_task: {e}")
        return JsonResponse({"status_code": 3})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def save_task(request):
    try:
        user = request.user
        user_id = c.get_user_id(user.username)
        body = json.loads(request.body.decode("utf-8"))
        return JsonResponse(c.post_request("save_task", body, {"user_id": user_id}))
    except Exception as e:
        logging.exception(f"Couldn't finish /save_task: {e}")
        return JsonResponse({"status_code": 3})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def terms_of_use(request):
    return render(request, "terms_of_use.html")

@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def privacy(request):
    return render(request, "privacy.html")

@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def terms(request):
    return render(request, "terms.html")

@cache_control(no_cache=True, must_revalidate=True, no_store=True)
def donation(request):
    return render(request, "donation.html")


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def finish_chapter(request):
    user = request.user
    user_id = c.get_user_id(user.username)
    body = json.loads(request.body.decode("utf-8"))
    res = c.post_request(
        "update_chapter_progress",
        {"chapter_id": body["chapter_id"], "status": "completed"},
        {"user_id": user_id},
    )
    if res is None:
        return JsonResponse({"error": "Try again later"})

    return JsonResponse(res)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def congratulations(request, course_id):
    user = request.user
    context = {
        "course_id": course_id,
        "congratulations": True,
        "status": "not_started",
    }

    user_id = c.get_user_id(user.username)

    for course in c.get_courses_stats(user_id):
        if course["course_id"] == course_id:
            context["status"] = course["status"]
            break

    return render(request, "congratulations/index.html", context)


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def finish_course(request):
    # Error codes:
    # -1 not authenticated
    # 1 not found user activitiy on chapter
    # 2 not all chapters/tasks are completed
    # 3 course is already marked as completed
    # 4 error updating course status

    user = request.user
    user_id = c.get_user_id(user.username)
    body = json.loads(request.body.decode("utf-8"))

    progress = c.get_progress(user_id, body)

    if "user_status_on_chapter" not in progress:
        return JsonResponse({"error_code": 1})

    if not progress.get("is_course_completed", False):
        return JsonResponse({"error_code": 2})
    
    if body.get("check_practice", False) and len(projects := progress.get("practice_projects", [])) > 0:
        projects_in_progress = [p for p in projects if p["status"] != "completed"]
        if len(projects_in_progress) > 0:
            return JsonResponse({"unfinished_projects": projects_in_progress, "course_id": progress["course_id"]})

    # We update course progress only in case of last chapter and
    # all tasks completed
    course_id = progress["course_id"]

    res = c.post_request(
        "update_course_progress",
        {"course_id": course_id, "status": "completed"},
        {"user_id": user_id},
    )
    if res is None or res.get("status", "") != "ok":
        if res is not None and res.get("current_status", "") == "completed":
            return JsonResponse({"error_code": 3})

        logging.warning(
            f"Error updating progress on course {course_id} for user {user.username}: {res}"
        )
        return JsonResponse({"error_code": 4})

    return JsonResponse({"course_completed": True, "course_id": course_id})

@csrf_exempt
def get_user_id_for_tg_bot(request):
    try:
        if not is_inner_request(request) or request.method != "POST" or len(request.body) > 200:
            return JsonResponse({})

        body = json.loads(request.body)

        if body.get("key", None) != settings.TG_BOT_KEY:
            return JsonResponse({})

        if body.get("user_id", None) is None:
            return JsonResponse({"error_code": 3})

        tg_bot_user_id = body["user_id"]
        if not isinstance(tg_bot_user_id, int):
            return JsonResponse({"error_code": 2})

        return JsonResponse({"user_id": c.get_user_id_for_bot(tg_bot_user_id)})
    except Exception as e:
        logging.warning(f"Error in view for bot: {e}")
        return JsonResponse({"error_code": 1})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def generate_tg_bot_key(request):
    user = request.user

    key = c.get_tg_bot_key(user.username)
    if len(key) == 0:
        return JsonResponse({"error": "Couldn't generate key"})

    return JsonResponse({"key": key})


@cache_control(no_cache=True, must_revalidate=True, no_store=True)
@login_required
def delete_tg_bot_link(request):
    user = request.user
    status = c.delete_tg_bot_link_for_user(user.username)
    return JsonResponse({"status": status})


@csrf_exempt
def delete_tg_bot_link_from_bot(request):
    try:
        if not is_inner_request(request) or request.method != "POST" or len(request.body) > 1000:
            return JsonResponse({})

        body = json.loads(request.body)

        if body.get("key", None) != settings.TG_BOT_KEY:
            return JsonResponse({})

        if body.get("user_id", None) is None:
            return JsonResponse({})

        tg_bot_user_id = body["user_id"]
        if not isinstance(tg_bot_user_id, int):
            return JsonResponse({})

        return JsonResponse(
            {"status": c.delete_tg_bot_link_for_tg_bot_user(tg_bot_user_id)}
        )
    except Exception as e:
        logging.warning(f"Error in view for bot: {e}")
        return JsonResponse({})


@csrf_exempt
def sync_tg_bot_with_site(request):
    try:
        if not is_inner_request(request) or request.method != "POST" or len(request.body) > 1000:
            return JsonResponse({})

        body = json.loads(request.body)

        if body.get("key", None) != settings.TG_BOT_KEY:
            return JsonResponse({})

        if (
            body.get("user_id", None) is None
            or body.get("activation_key", None) is None
        ):
            return JsonResponse({})

        tg_bot_user_id = body["user_id"]
        if not isinstance(tg_bot_user_id, int):
            return JsonResponse({})

        activation_key = body["activation_key"]
        if not isinstance(activation_key, str):
            return JsonResponse({})

        return JsonResponse(
            {"status": c.sync_tg_bot(tg_bot_user_id, activation_key)}
        )
    except Exception as e:
        logging.warning(f"Error in view for bot: {e}")
        return JsonResponse({})
