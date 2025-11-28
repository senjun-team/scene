FROM quay.io/centos/centos:stream9

RUN yum upgrade -y && \
    yum install -y -q bash vim \
    diffutils rpmdevtools rpmlint rpm-build redhat-rpm-config epel-release \
    go gem squashfs-tools && \
    gem install fpm

ENTRYPOINT sh /mnt/scene/accomodation/build_rpm.sh
