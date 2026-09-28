# Use server-authoritative versioned document issuance

**Status: accepted**

Template Studio will keep editable drafts separate from immutable published template versions and will use a server-authoritative renderer for certificate issuance. Each successful issuance receives a certificate number, verification identifier, immutable value snapshot, template-version reference, issuer, timestamp, and content hash; rendered files are not retained by default. This trades some implementation complexity for reproducible output, privacy-safe verification, correction/revocation history, and consistent future bulk generation. Existing layout/preset work must be reconciled with this decision before implementation proceeds.
