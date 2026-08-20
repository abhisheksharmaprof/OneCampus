import base64

import pytest

from modules.file_storage.policies import (
    FilePolicyError,
    normalize_file_name,
    validate_content_md5,
    validate_scope,
    validate_upload_declaration,
)


def test_normalizes_unicode_display_name_and_rejects_paths():
    assert normalize_file_name("  Report ２０２６.pdf  ") == "Report 2026.pdf"
    with pytest.raises(FilePolicyError) as error:
        normalize_file_name("../../report.pdf")
    assert error.value.code == "INVALID_FILE_NAME"


def test_sensitive_documents_are_private_and_server_limited():
    with pytest.raises(FilePolicyError) as error:
        validate_upload_declaration(
            category="MARKSHEET",
            file_name="marks.pdf",
            media_type="application/pdf",
            size_bytes=1024,
            visibility="PUBLIC",
        )
    assert error.value.code == "VISIBILITY_NOT_ALLOWED"


def test_non_institute_owner_requires_branch_scope():
    with pytest.raises(FilePolicyError) as error:
        validate_scope(owner_type="STUDENT", branch_id=None)
    assert error.value.code == "OWNER_SCOPE_DENIED"


def test_content_md5_is_exactly_sixteen_bytes():
    value = base64.b64encode(b"0123456789abcdef").decode()
    assert validate_content_md5(value) == value
    with pytest.raises(FilePolicyError):
        validate_content_md5(base64.b64encode(b"short").decode())
