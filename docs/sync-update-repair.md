# Sync and required-update repair — unreleased app changes

## Live repair (16 October 2026)
Production `public.orders` lacked `split`, although `app_private.write_order`
references that field for validation and settlements. Applied the additive
`orders_split_compatibility` migration and verified the JSONB column exists.
No orders or reports were removed or replaced. Existing APK users can retry
pending operations with **Retry sync**. Do not use **Set aside & reload** to
resolve this error, clear app storage, or uninstall with unsynced orders.

## Staged app changes
- Removed the set-aside shortcut from the sync banner. Failed operations remain
  queued; successful quick saves do not flash a warning.
- Added original-account/cart order recovery for existing device backups,
  preserving operation IDs and atomic stock commands. Server conflict checks
  still apply. Backups remain after recovery; they are not silently deleted.
- Required updates: native foreground check of `/api/app-update`, cached policy,
  full-screen non-cancelable gate when installed code is below the minimum,
  download/resume and existing checksum/package/signature verification.
  Android installation consent remains required. Cancelling installation leaves
  the gate in place. A valid policy withdrawal clears it. A network failure
  preserves a known requirement; a device with no cached requirement remains
  usable. No forced policy is enabled by this change.
- Startup: route-level lazy loading, no duplicate cart polling during hydration,
  stable polling session dependency, 12-second bounded API requests. Timed-out
  writes retain their operation IDs for safe retry.

## Release integration
Do not publish without explicit user approval. Android version remains 1.5.0/7;
public APK and manifest are unchanged. The new native flow cannot retrofit an
already installed APK. Users need one normal upgrade to receive it.

On an approved release: apply `android_update_policy` migration, publish and
verify the new signed APK/manifest, deploy `/api/app-update` with its included
manifest, then set `android_update_policy.minimum_version_code` to the verified
published code if that release is mandatory. The endpoint rejects a minimum
above the published code. Only database release operators can update policy.
Default minimum is zero. Existing older clients keep their current updater.

## Validation
36 app tests and 27 isolated database tests pass, including legacy schema repair,
account-scoped recovery, unavailable/unpublished update policy, and policy write
permission rejection. Debug APK/instrumentation build and lint pass. Android 7
emulator also verifies the required-update gate cannot be dismissed with Back,
clears when the requirement is withdrawn, and checks manifest validation,
tampered APK rejection, printing
routing and local notification regressions. Physical-device upgrade/install and
real phone loading-time measurements remain release verification steps.

## Startup correction (17 October)
`MainActivity.onCreate` starts the update check before calling `WebView.loadUrl`
for `/login`. A small native spinner covers this short check. Cached required
policy blocks immediately, including offline; a valid non-required result
continues to login. Network failure with no known requirement preserves offline
access. Optional new versions are offered automatically once per process.
Login/workspace and route loading now use a small spinner, with an inline spinner
on the sign-in button. Removed the branded Getting ready card and its copy.
The public 1.5.0 APK still has the manual updater; this startup flow and its
backend policy integration remain part of the next explicitly approved release.
Startup verification: Android 7 instrumentation confirms a cached required update
leaves the WebView URL unset (login has not loaded), and a controlled fresh
policy request must finish before its login callback can run. Debug build/lint
and all 36 app tests pass. Instrumentation uses a bounded ActivityMonitor because
startActivitySync can wait indefinitely for a window draw behind a startup gate.
