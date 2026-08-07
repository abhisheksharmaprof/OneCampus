from django.contrib import admin

from .models import Branch, Institute, InstituteMembership


class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0


@admin.register(Institute)
class InstituteAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
    inlines = (BranchInline,)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "institute", "is_head_office", "is_active")
    list_filter = ("institute", "is_active", "is_head_office")
    search_fields = ("name", "code", "institute__name")


@admin.register(InstituteMembership)
class InstituteMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "institute", "branch", "is_active", "valid_until")
    list_filter = ("role", "is_active", "institute", "branch")
    search_fields = ("user__email", "institute__name", "branch__name")
    autocomplete_fields = ("user", "institute", "branch")
