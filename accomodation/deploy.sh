#!/bin/bash

set -e

echo Start deploying

python manage.py migrate

python manage.py collectstatic


echo Stop deploying
