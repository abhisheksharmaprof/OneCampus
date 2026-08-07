from rest_framework.pagination import PageNumberPagination


class AdminPageNumberPagination(PageNumberPagination):
    """Bounded pagination contract for admin tables.

    The response shape deliberately keeps ``items`` stable for existing clients while
    exposing enough metadata for accessible 25/50/100-row table controls.
    """

    page_size = 25
    page_size_query_param = "pageSize"
    max_page_size = 100

    def get_page_data(self, items):
        return {
            "count": self.page.paginator.count,
            "page": self.page.number,
            "pageSize": self.page.paginator.per_page,
            "totalPages": self.page.paginator.num_pages,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "items": items,
        }


def paginate_admin_queryset(*, request, queryset, serializer_class):
    if hasattr(queryset, "ordered") and not queryset.ordered:
        model = getattr(queryset, "model", None)
        meta_ordering = getattr(getattr(model, "_meta", None), "ordering", None)
        if meta_ordering:
            queryset = queryset.order_by(*meta_ordering)
        else:
            queryset = queryset.order_by("pk")
    paginator = AdminPageNumberPagination()
    page = paginator.paginate_queryset(queryset, request)
    items = serializer_class(page, many=True, context={"request": request}).data
    return paginator.get_page_data(items)
