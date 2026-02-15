export DJANGO_SETTINGS_MODULE=scene.settings_dev

manage := uv run ./scene/manage.py

init: scene/conf.json
	mkdir -p staticfiles/courses/{authors,default_projects}
	cp ./scene/courses/static/courses/authors/courses.json staticfiles/courses/authors/courses.json
	$(manage) migrate
	$(manage) runserver

image: 
	docker build --rm -t scene .

scene/conf.json: ./scene/conf-template.json
	cp $< $@
	sed -i 's#/var/www/scene/static/#staticfiles#' $@


clean:
	rm -f ./scene/conf.json
	rm -rf staticfiles
	docker rm -f scene

clean_all: clean
	docker rmi scene
