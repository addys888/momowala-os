# Android architecture review baseline

Reviewed baseline: `cf4cb2d5f3a042c3985de8e6606be86de89976db` (APK 1.1.1 shell), October 12, 2026. This document records implementation boundaries and follow-up work; the authoritative Codex Security scan is `077281c9-865a-46e7-b967-6f816bd60410`.

The scan completed with **one low-severity finding** and **partial coverage**. It was an offline source review with an independent baseline auditor and architecture reviewer, not a certification or device penetration test. New reminder code developed after source capture is outside that baseline.

## Established boundaries

- The launcher loads a fixed application URL. It does not accept a caller-supplied URL from incoming Android intents.
- The shell serves bundled application screens from APK assets under the website's HTTPS origin. API requests continue over the network. Navigation filtering does not restrict every network subresource.
- File/content WebView access and mixed content are disabled; certificate failures retain default cancellation. The baseline has no JavaScript-to-native bridge.
- Sessions and offline operations use private WebView origin storage. Android backup and device-transfer exclusions are configured. Backend session and tenant authorization remain separate controls.
- Release signing properties are referenced outside the repository; the Gradle distribution has a SHA-256 pin. Private signing-file permissions and wrapper bytecode authenticity were not verified by this review.

## Validated finding

**Unrestricted RawBT intent recipient (CWE-927, low):** baseline `MainActivity.external()` sends receipt bytes through an implicit `ACTION_VIEW` intent without binding the approved printing package. A malicious installed application can receive those bytes if selected or configured as the `rawbt` handler. Installation alone is insufficient, and this finding does not establish token theft or account compromise.

Bind this custom-scheme handoff to the approved RawBT package, fail closed if unavailable, and test unchanged receipt bytes and competing-handler isolation. Ordinary browser links should retain their normal routing.

## Follow-up before a reminder release

- Validate file-picker result URIs and grants. The baseline forwards `parseResult()` directly; private-file exfiltration was not proven and remains a device-test question.
- Review any new native bridge separately: trusted origin/frame, bounded validated payloads, no unnecessary bearer-token exposure, and logout/session-expiry cleanup.
- Verify alarm ownership, disabled-staff handling, reboot/timezone/time-change recovery, permission denial, process death, and acknowledged Load Cart completion. Android force-stop and denied permissions must be reflected honestly in setup/status UI.
- Check the actual release bundle against source. Generated JavaScript and dependency/binary internals were not exhaustively reviewed.
- Test supported Android/WebView versions. Android 7 compatibility does not imply current OS or WebView security patches.

No APK release was performed by the review. Release remains subject to the user's explicit instruction.
