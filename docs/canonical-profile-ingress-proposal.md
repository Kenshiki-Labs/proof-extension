# Pulse Observer canonical connection profile proposal

Status: accepted bounded proposal; implemented locally and under qualification, not released.

## Frozen source and actual caller

The normal task worktree starts at dev
`cb7bbbda6f3b7c9ad36617669f2b87165a8bca50`; current published main is
`3a101db56b6239d073116b7270cf6533d0ed302f`. Their source difference is
only the branch-hygiene workflow. No other checkout is modified.

The actual call is the explicit `reveal` action in `src/components/LocationReveal.tsx:44`.
Its endpoint at line25 currently allows a public build override and defaults to the
old Gate public profile. It fetches at line47, accepts bare/enveloped JSON without
checking HTTP status at lines48–54, and has no request cancellation ownership.
The component is mounted by `src/components/report/EvidenceView.tsx:84` only when
the narrowing model has steps, inside the actual extension report tab. This proposal
changes that one informational caller; no background/content-script transport is added.

## Exact paired delivery contract

Use one fixed public URL:
`https://gateway.kenshikilabs.com/services/bond/api/session-profile`.
Send a bodyless GET, no query, no application headers, credentials `omit`, redirect
`error`, mode `cors`, cache `no-store` and the owned AbortSignal. No endpoint override,
old-host fallback, proxy, retries, certificate, bearer, cookie or method override.
The paired gateway is GET-only: this simple request needs no preflight; OPTIONS is
not part of its admission. Browser-supplied Origin/UA are informational, not identity.
Extension host permission behavior may affect Origin/CORS handling; observe actual
built-extension requests rather than claiming a chrome-extension Origin is guaranteed.

The gateway must derive CF-Connecting-IP and its Request.cf subset from its actual
inbound connection, then dispatch through the private BOND_SERVICE binding to the
fixed logical `https://gate.kenshikilabs.com/api/session-profile`. The accepted Gate
private source is `b66cc1f2675a279951f50c28866f39e41f3446f6` with reviewed docs
`83bb9f997a483ae8aa7b9e067b9674bac5e982e0`; it independently rejects alternate
targets, methods, credentials and overrides and invokes the existing handler. Its
nine CF keys are asn, asOrganization, country, region, city, postalCode, latitude,
longitude and timezone. Missing CF metadata stays null; this is connection context,
not GPS, measured accuracy, an installation identity or an original visitor hidden
behind another server. The gateway counterpart is separately owned and not yet
claimed deployed by this proposal. No native/browser authentication exemption is added.

The existing handler response is `{ok:true, profile:{network:...}}`. A small core
transport validates success status and this actual envelope before returning only
nullable city/region/country and finite latitude[-90,90]/longitude[-180,180].
`accuracyRadiusKm` must remain null under this CF contract; no radius is invented.
Null/missing coordinates, invalid JSON, wrong envelope/status or redirects fail the
reveal with the existing error state. Extra profile fields need not be retained,
rendered, logged, exported or put into extension storage. A synthetic test fixture
is the only source of coordinates in qualification.

## Bounded app changes

1. Amend `docs/surface-contract.md` before component edits with the existing explicit
   reveal action and the corrected CF approximate-location disclosure. Update the
   location-only egress entry in `docs/permissions.md`; manifest permissions/CSP do
   not expand. The existing `<all_urls>` and HTTPS connect policy already cover
   the canonical host (`package.json`).
2. Add one shared-core connection-profile transport and meaningful tests. Product
   validation belongs in core; helpers never go directly under `src/contents`.
   The destination is constant. Tests inject a fetch port or intercept network,
   rather than adding a shipping endpoint selector. No new dependency is planned.
3. Port only LocationReveal. Preserve user initiation and current state/UI flow;
   retain an AbortController, abort on replacement/unmount and refuse late state
   updates after cancellation. Do not fetch automatically or add background work.
   Correct the obsolete MaxMind comment and visible provider attribution to CF
   approximate IP location. Preserve current token styling and report placement.
4. Keep the existing optional Mapbox static-image mechanism and public build token
   name unchanged; no live Mapbox request is authorized. Preserve the no-token
   behavior. The user-facing egress disclosure must acknowledge the optional map
   image after the profile request. Capture a synthetic screenshot immediately
   after the first visible edit, before another visual change.

## Validation before source acceptance

Read current framework/fetch and affected component/test contracts in full before
implementation. Test the actual core fetch options, exact destination and abort;
validate wrong status/envelope/finite bounds/null CF/redirect failure with synthetic
responses. Do not merely duplicate schema implementation in tests.

Run the actual compiled component in isolated Chromium for no request before click,
one canonical request after click, no cookies/unsafe headers, error/null handling
and unmount cancellation. Then use the built Chrome MV3 extension report tab and
synthetic local observation fixture to reach the actual LocationReveal caller;
intercept all external requests and the optional map image. Keep its user-data
directory task-owned and unique; do not stop/delete another session's browser.
Record actual extension request Origin behavior without exposing real IP/location.
Synthetic intercepted browser evidence is not production CF provenance or TLS proof.

The production gate is `pnpm qa`, then Firefox/Edge builds and root manifest checks
per `docs/qa.md` and CLAUDE. Preserve every assertion, timeout, coverage threshold
and existing freshness gate. Do not run `qa:refresh` or mutate unrelated generated
intelligence to clear a baseline failure. Check no colliding Plasmo dev process
exists before target builds; preserve `.plasmo`/build state belonging to others.
Record exact source/artifact hashes and distinguish unit tests, built extension,
synthetic Chrome and later live nonpersonal qualification. No deploy/publication
or runtime edit is authorized until this proposal's independent review is complete.

## Known coverage and release prerequisites

This covers only the source-proven Pulse Observer report reveal. Gate/Bond RPC,
verifier, native identity, proof-website server enrichment and pulse-website's
different response projection remain separate contracts. The extension references
`docs/extension.md`, which is absent in this frozen checkout; current surface,
architecture, permission and QA contracts above supply the available guidance.

Current Chrome cross-origin contract was read on2026-10-29:
https://developer.chrome.com/docs/extensions/develop/concepts/network-requests .
It distinguishes foreground-extension host permission from content-script origin
constraints. Fetch options were checked against the current RequestInit contract:
https://developer.mozilla.org/en-US/docs/Web/API/RequestInit .

The Gate remote remains archived, blocking that private Worker publication. The
paired canonical gateway and same-app private Worker with existing secret values
must publish and qualify before claiming this extension's real public path works.
Old public profile delivery remains until corresponding consumers are qualified.
No extension store distribution, live location, identity/supplier transaction or
production authentication claim is made here.

## Implementation and qualification checkpoint

The root reviewer accepted the original proposal SHA256
`faa12f58721d40e332ebf54ee9025e00887755cb5c69b67d50d93f367235a6f2`
before runtime edits. The normative surface/permission disclosures were amended
first. The actual component now uses the fixed core transport, validates the real
envelope and finite display fields, owns cancellation and refuses late completion.
No endpoint selector, permission/CSP change, storage, supplier call or new dependency
was introduced. Initial idle/ready screenshots were captured and inspected before
further visible changes, from the actual compiled component and generated styles
using synthetic intercepted geography with no Mapbox token.

The20 focused core cases passed. The actual compiled component passed seven isolated
Chromium cases (success, HTTP500, wrong envelope, absent geography, redirect refusal,
unmount cancellation and an optional image using a synthetic public Mapbox token). The actual built Chrome MV3 extension report tab passed its
new explicit-click ingress test: no automatic request, exactly one canonical GET,
no ambient cookie or authorization and no unknown egress. These synthetic results
do not prove production connection provenance or a real location. Chrome, Firefox
and Edge builds all completed with manifests at their required output roots.

The first unchanged `pnpm qa` correctly failed intelligence freshness after555
tests/59 files and coverage passed. The existing package was0.7.0 while its committed
snapshot manifest declared0.6.0. The gate's own generator changed only that manifest
packageVersion to0.7.0; the independent root reviewer read both full manifests and
approved retaining exactly that necessary release-metadata correction. No date,
artifact hash, signing field, intelligence fact, generator or gate changed, and
`qa:refresh` was not run. The subsequent unchanged `pnpm qa` passed, including all
13 intelligence artifacts remaining byte-identical on regeneration,44 promoted
trackers,555 unit cases and the Chrome production build. The first failure and
original/generated manifest bytes are preserved separately.

Paired gateway public-profile draft PR67 is source-reviewed and its actual local
router→archived Gate/Nitro binding passed65 synthetic cases, independently authored
by the native transport agent. This app unit does not claim to have run those65
cases or deployed that gateway. Final source review, repeat final-source checks
and the archived Gate private Worker publication remain release prerequisites.
Evidence lives outside the source checkout under
`mtls-qualification/20261028-xt6zvpn4/observer-profile-browser/`.


The independent source review identified one test-contract defect before acceptance:
the new E2E initially rejected the existing optional Mapbox image on token-configured
builds. Its corrected test admits only GET for the exact synthetic fixture-coordinate
Mapbox static image with one nonempty access_token field, fulfills it locally and
keeps every unknown target denied. No token value or image URL is logged. It asserts
zero profile/image requests before the click and zero images for a no-token view.
The actual component was also compiled into a task-only synthetic-token artifact;
the seven-case browser receipt covers both absent and present optional images.
A production-shaped Chrome artifact built with only the existing Mapbox environment
variable set to a synthetic public token passed the actual report E2E with exactly
one intercepted map image, one credential-free profile GET and no unknown egress.
No source configuration or manifest permission changed and no Mapbox network was
used. The normal final QA rebuilds the artifact without that test token. Both
source-review correction and final test runs must remain separate from production
TLS, connection provenance or store-release qualification.
