from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from django.db import IntegrityError

from modules.identity.services import issue_session_tokens, resolve_session_context

from .serializers import InstituteApplicationSerializer, InstituteOnboardingSerializer, InstituteOnboardingSuccessSerializer


class InstituteApplicationView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "institute-onboarding"

    def post(self, request):
        serializer = InstituteApplicationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            result = serializer.save()
        except IntegrityError as exc:
            if "slug" in str(exc).lower():
                return Response({"success": False, "error": {"code": "VALIDATION_ERROR", "message": "This institute URL name is already taken.", "fieldErrors": {"identity.slug": ["This URL name is already taken."]}}}, status=status.HTTP_400_BAD_REQUEST)
            raise
        context = resolve_session_context(user=result["user"], client="admin-web", membership_id=result["membership"].id)
        session = issue_session_tokens(user=result["user"], context=context, client="admin-web")
        session["onboarding"] = {"completed": False, "status": "pending_review", "instituteName": result["institute"].display_name, "slug": result["institute"].slug, "publicUrl": f"https://{result['institute'].slug}.arkailabs.com"}
        return Response({"success": True, "data": session}, status=status.HTTP_201_CREATED)


class InstituteOnboardingView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "institute-onboarding"

    @extend_schema(
        request=InstituteOnboardingSerializer,
        responses={status.HTTP_201_CREATED: InstituteOnboardingSuccessSerializer},
    )
    def post(self, request):
        serializer = InstituteOnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        user = result["user"]
        membership = result["membership"]
        context = resolve_session_context(
            user=user,
            client="admin-web",
            membership_id=membership.id,
        )
        session = issue_session_tokens(user=user, context=context, client="admin-web")
        session["onboarding"] = {"completed": True}
        return Response(
            {
                "success": True,
                "data": session,
            },
            status=status.HTTP_201_CREATED,
        )
