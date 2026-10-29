# Partner 1.8.2 (25)

Released manager operations: compact closing, physical-count submission without discrepancy warnings or mandatory notes, staff meals (1–10 pieces per entry), persistent mark-all-read, and ten-minute closing reminders with recorded leave/off suppression. Owners retain private stock comparisons and meal totals/costs.

Production migration manager_meals_and_closing applied and verified. Direct meal-table writes and private closing-snapshot execution are denied to client roles. Existing Supabase advisories remain for the project's guarded custom-session SECURITY DEFINER RPCs and public extension; the meal table is RPC-only with RLS enabled and no direct grants.

Validation: 44 app tests plus 11 focused tests passed; isolated partner web build, signed Android release assembly, release lint, certificate and Android 7 compatibility metadata passed. Native reminder display/timing still needs physical phone verification; no device was connected. No production test orders, meals, closing counts or stock records were created.

Install over the existing APK. Version 1.8.2 is required to remove the old client-side closing warning and disabled button.

APK SHA-256: adff5a556e4a5f0afaa1aebad18f903674bb15bc31f6bbd64a457e4a052bef32
