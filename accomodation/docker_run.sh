#!/bin/bash

docker run -it  \
  -v $(pwd)/..:/mnt/scene \
  scene_rpm
