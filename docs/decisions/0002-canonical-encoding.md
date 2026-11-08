# Decision 0002 — Canonical Encoding and Commitments

Status: adopted for domain v1. Date: 2026-11-07.

## Canonical JSON v1

RoyaltyDesk hashes UTF-8 bytes of compact JSON. Objects sort keys by Unicode code-point order. Arrays preserve their declared semantic order; agreement participants are sorted by owner account before encoding. Strings are normalized to Unicode NFC. Values may be strings, booleans, null, arrays, or objects. JavaScript numbers, `bigint`, `undefined`, non-finite values, and sparse arrays are rejected. Amounts, basis points, versions, epochs, and timestamps are base-10 strings without signs or leading zeroes except `0`.

Optional fields are omitted. `null` is allowed only where the schema explicitly assigns it meaning, including the absence of recoupment. Omitted and null therefore never become accidentally interchangeable.

## Agreement approval digest

The structured rules and exact rendered document bytes receive independent SHA-256 hashes. The approved payload is canonical JSON containing:

- `application`: `royaltydesk`
- `schema`: `agreement-approval/v1`
- `networkId`, `contractId`, `releaseId`
- `agreementVersion` as a decimal string
- `rulesHash` and `documentHash` as lowercase hexadecimal SHA-256

The final approval digest is SHA-256 over those canonical payload bytes. Changing the application, network, contract, release, version, rules, or document changes the digest. A digest proves which bytes were approved; it does not prove music ownership, legal enforceability, or source truth.

## Shared vectors

Pinned canonical bytes and digests live in `fixtures/agreements/canonical-v1.json`. TypeScript tests consume the expected bytes/digests as data. Rust tests must consume the same fixture in Phase 2 rather than copying TypeScript output into expected contract state.
