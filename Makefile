export DJANGO_SETTINGS_MODULE=scene.settings_dev

manage=uv run ./scene/manage.py
init:
	cp ./scene/conf-template.json ./scene/conf.json
	mkdir -p staticfiles/courses/{authors,default_projects}
	cp ./scene/courses/static/courses/authors/courses.json staticfiles/courses/authors/courses.json
	$(manage) migrate
	$(manage) runserver

clean:
	rm ./scene/conf.json
	rm staticfiles
