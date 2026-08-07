from django.conf import settings
from django.db import connection
from drf_spectacular.utils import extend_schema, inline_serializer
from redis import Redis
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

HEALTH_RESPONSE = inline_serializer(
    name="HealthResponse",
    fields={
        "success": serializers.BooleanField(),
        "data": serializers.DictField(),
    },
)
READINESS_RESPONSE = inline_serializer(
    name="ReadinessResponse",
    fields={
        "success": serializers.BooleanField(),
        "data": serializers.DictField(),
    },
)


class HealthView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(responses={status.HTTP_200_OK: HEALTH_RESPONSE})
    def get(self, request):
        return Response({"success": True, "data": {"status": "ok", "service": "campusone-api"}})


class ReadinessView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(
        responses={
            status.HTTP_200_OK: READINESS_RESPONSE,
            status.HTTP_503_SERVICE_UNAVAILABLE: READINESS_RESPONSE,
        }
    )
    def get(self, request):
        services = {}
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            services["database"] = "ok"
        except Exception:
            services["database"] = "error"

        if settings.CELERY_TASK_ALWAYS_EAGER:
            services["redis"] = "skipped"
        else:
            try:
                Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1).ping()
                services["redis"] = "ok"
            except Exception:
                services["redis"] = "error"

        ready = all(value in {"ok", "skipped"} for value in services.values())
        return Response(
            {
                "success": ready,
                "data": {"status": "ready" if ready else "not_ready", "services": services},
            },
            status=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
