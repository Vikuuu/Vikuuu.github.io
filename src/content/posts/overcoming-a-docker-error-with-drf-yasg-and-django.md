---
title: "Overcoming a Docker error with DRF YASG and Django"
pubDate: 2024-09-06
description: ""
author: "Guts Thakur"
tags: ["docker", "python", "django", "swagger"]
---
![Docker with Python](https://media.licdn.com/dms/image/v2/D4D12AQHXcpiB7UmjCA/article-cover_image-shrink_720_1280/article-cover_image-shrink_720_1280/0/1725613478055?e=1736985600&v=beta&t=RvCQCc_ZAEuOo8EbHHFpBH3BSVVga9jy69qSp2YT3PQ) 

```bash
ModuleNotFoundError: No module named 'pkg_resources'
```

Today, while working on adding **DRF-YASG**(a popular Swagger tool for Django REST Framework) to my Django project, I ran into an unexpected issue when running the Docker container. The above was the error message.


Initially, I wasn't sure what was causing the error, but after some research, I found that the issue was related to dependencies in my Docker image i.e. Alpine Image. Specifically, the *pkg_resources* module is part of the *setuptools* package, which wasn't included in my Docker setup. Since DRF-YASG depends on pkg_resources, and that, in turn, depends on setuptools, my Docker image was missing a key component.


It's fascinating(and sometimes frustrating!) how one missing package can affect the entire applications. These packages do provide the abstraction but can cause problem if we do not know what we are doing. In this case, setuptools  is a core utility for Python packaging. It provides the tools needed to package Python projects, manage dependencies, and ensure everything is set up correctly.


To fix the issue, I added the setuptools package to my Dockerfile to make sure it's installed in the virtual environment while the docker building process.


Here's code snippet:

```Dockerfile
FROM python:3.12-alpine3.20
. . .

RUN python -m venv /py && \
    /py/bin/pip install --upgrage pip && \
    /py/bin/pip install setuptools && \

. . .
```

Add the setuptools using the pip or python package manager as this is the python dependency not the OS dependency(I am guilty of this mistake 😔).

Once I added setuptools, and ran this command:

```Dockerfile
docker-compose build --no-cache
```

everything worked smoothly. It's a reminder that while Docker helps streamline the environment setup, understanding the dependencies with your stack is crucial to avoid unexpected errors.
