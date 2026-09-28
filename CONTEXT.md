# CampusOne Document Generation

This context defines the language for designing templates, generating school documents, and recording issuance where a document family requires it.

## Template Studio

**Document family**:
A class of school document with its own source record, fields, generation flow, and policy for whether a lasting issuance is needed.
_Avoid_: universal document workflow

**Template**:
A reusable document design with stationery, dynamic fields, layout rules, and a primary record type.
_Avoid_: form, report layout

**Draft**:
A mutable template version that is not eligible for document issuance.
_Avoid_: unpublished document

**Published version**:
An immutable template version approved for generation; later edits create a new draft version.
_Avoid_: active template

**Stationery**:
A reusable page treatment for official letterhead or pads, including print margins, school identity, and decorative elements.
_Avoid_: template, background

**Brand asset**:
An institute-scoped logo, seal, signature, stamp, or other reusable image asset.
_Avoid_: attachment, media

## Dynamic data and issuance

**Generation**:
On-demand creation of a print-ready document from current records and a selected template, without a permanent issuance record.
_Avoid_: issuance

**Primary record**:
The record selected to generate a document, such as a student for a certificate; related records are resolved from it within authorized scope.
_Avoid_: subject, context object

**Field**:
A typed, permission-aware value exposed by the field catalog for insertion into a template.
_Avoid_: placeholder token, variable

**Issuance**:
An immutable record that a published template produced a document for a recipient at a specific time.
_Avoid_: generated file, print job

**Certificate number**:
A unique human-readable identifier assigned to an issuance according to its branch and certificate-type numbering policy.
_Avoid_: document ID, template ID

**Verification**:
A public, privacy-minimized status lookup for an issuance using an unguessable verification identifier.
_Avoid_: public student record

**Revocation**:
A permanent status change that invalidates an issuance without editing its historical values; a correction creates a successor issuance.
_Avoid_: delete, edit history
