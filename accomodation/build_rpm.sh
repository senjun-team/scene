#!/bin/bash

set -e

echo Start

cp -Rp /mnt/scene .
cd scene/accomodation

sh run_fpm.sh

cp *.rpm /mnt/scene/accomodation
echo RPM is ready
