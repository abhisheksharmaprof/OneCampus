from uuid import uuid4

import pytest

from modules.file_storage.storage.keys import InvalidObjectKey, ObjectKeyBuilder


def test_builds_institute_and_branch_scoped_keys_without_names():
    keys = ObjectKeyBuilder()
    institute_id, branch_id, owner_id, asset_id, upload_id = (uuid4() for _ in range(5))

    staging = keys.staging(institute_id=institute_id, branch_id=branch_id, upload_id=upload_id)
    original = keys.original(
        institute_id=institute_id,
        branch_id=None,
        owner_type="INSTITUTE",
        owner_id=institute_id,
        category="LOGO",
        asset_id=asset_id,
        extension="PNG",
    )

    assert staging == (
        f"v1/staging/institutes/{institute_id}/branches/{branch_id}/uploads/{upload_id}/source"
    )
    assert original == (
        f"v1/objects/institutes/{institute_id}/branches/_institute/owners/institute/"
        f"{institute_id}/logo/{asset_id}/original.png"
    )


def test_variant_and_public_keys_are_immutable_uuid_paths():
    keys = ObjectKeyBuilder()
    institute_id, branch_id, owner_id, asset_id, variant_id, public_id, revision_id = (
        uuid4() for _ in range(7)
    )
    variant = keys.variant(
        institute_id=institute_id,
        branch_id=branch_id,
        owner_type="STUDENT",
        owner_id=owner_id,
        category="PROFILE_PHOTO",
        asset_id=asset_id,
        variant_type="THUMBNAIL",
        variant_id=variant_id,
        extension="webp",
    )
    public = keys.public_branding(
        institute_id=institute_id,
        branch_id=branch_id,
        category="BANNER",
        public_id=public_id,
        revision_id=revision_id,
        extension="webp",
    )
    assert variant.startswith(
        f"v1/variants/institutes/{institute_id}/branches/{branch_id}/owners/student/{owner_id}/"
    )
    assert public == (
        f"v1/public/institutes/{institute_id}/branches/{branch_id}/branding/banner/"
        f"{public_id}/{revision_id}.webp"
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [("owner_type", "../../student"), ("category", "logo/school"), ("extension", "../png")],
)
def test_rejects_traversal_and_unvalidated_segments(field, value):
    values = {
        "owner_type": "STUDENT",
        "category": "PROFILE_PHOTO",
        "extension": "png",
    }
    values[field] = value
    with pytest.raises(InvalidObjectKey):
        ObjectKeyBuilder().original(
            institute_id=uuid4(),
            branch_id=uuid4(),
            owner_id=uuid4(),
            asset_id=uuid4(),
            **values,
        )
