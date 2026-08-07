import pytest
from django.core.exceptions import ImproperlyConfigured

from config.environment import settings_module


def test_settings_module_selects_railway_production_environment(monkeypatch):
    monkeypatch.setenv("DJANGO_ENV", "production")

    assert settings_module() == "config.settings.production"


def test_settings_module_rejects_unknown_environment(monkeypatch):
    monkeypatch.setenv("DJANGO_ENV", "staging-typo")

    with pytest.raises(ImproperlyConfigured):
        settings_module()
