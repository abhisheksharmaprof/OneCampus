import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def clear_shared_cache():
    """Prevent one request-throttle test from influencing another test."""
    cache.clear()
    yield
    cache.clear()
