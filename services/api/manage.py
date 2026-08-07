#!/usr/bin/env python
import os
import sys

from config.environment import settings_module


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module())
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
