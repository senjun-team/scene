from django.urls import path

from . import views

urlpatterns = [
    path("", views.courses, name="courses"),

    # /courses/python/
    path("<str:course_id>/", views.course, name="course"),

    # /courses/python/chapters/python_chapter_0010/
    path("<str:course_id>/chapters/<str:chapter_id>/", views.chapter, name="chapter"),

    # /courses/python/start_course/
    path("<str:course_id>/start_course/", views.start_course, name="start_course"),

    # /courses/python/current_chapter/
    path("<str:course_id>/current_chapter/", views.current_chapter, name="current_chapter"),

    path('<str:course_id>/congratulations/', views.congratulations, name = 'congratulations'),

    path('<str:course_id>/practice/<str:project_id>/', views.practice, name = 'practice'),
]