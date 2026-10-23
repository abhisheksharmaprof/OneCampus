from django.urls import path

from modules.mcp.views import MCPView

urlpatterns = [path("", MCPView.as_view(), name="mcp")]
