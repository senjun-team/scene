set -e 

version="0.1.16"
django_dir="/senjun/scene" 

fpm \
  -s dir -t rpm \
  -p scene-$version-1-noarch.rpm \
  --name scene \
  --license agpl3 \
  --version $version \
  --architecture all \
  ../scene=$django_dir \
  ../requirements.txt=$django_dir/requirements.txt \
  deploy.sh=$django_dir/scene/deploy.sh
