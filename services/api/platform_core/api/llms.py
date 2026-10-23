from pathlib import Path
from django.conf import settings

from django.http import HttpResponse
from django.views import View


class LlmsTxtView(View):
    """Serve the frontend's concise LLM discovery document as plain text."""

    def get(self, request):
        document = (
            Path(settings.BASE_DIR).parent.parent
            / "apps"
            / "institute-admin-web"
            / "public"
            / "llms.txt"
        )
        try:
            content = document.read_text(encoding="utf-8")
        except OSError:
            return HttpResponse(content=b"CampusOne capability documentation is unavailable.\n", status=503, content_type="text/plain; charset=utf-8")
        return HttpResponse(content=content.encode("utf-8"), content_type="text/markdown; charset=utf-8")
