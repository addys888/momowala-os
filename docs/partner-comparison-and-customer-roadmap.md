# Cartlyft Partner review — 13 October 2026

Compared public Zomato partner materials, not an authenticated Zomato account or a claimed certification:
- https://play.google.com/store/apps/details?id=com.application.services.partner
- https://www.zomato.com/developer/integration/docs/overview/
- https://www.zomato.com/developer/integration/docs/api-documentation/menu-management/
- https://www.zomato.com/developer/integration/docs/api-documentation/order-management/

| Workflow | Public Zomato capability | Cartlyft status / change |
| --- | --- | --- |
| Live orders | Receive and manage order status | Existing live order feed, payment/stock checks and print handoff; added direct Home shortcut |
| Outlet operations | Outlet availability and operations | Added visible opening/closing hours and direct Cart settings & hours control |
| Menu and stock | Menu items and stock availability | Existing menu editor and inventory; opening stock shortcut added |
| Reporting | Track business performance | Existing reports and reconciliation; now distinguishes pending device saves from confirmed records |
| Recovery | No claim about their internal recovery behavior | Added owner/cart-scoped local report recovery with amount review, original operation IDs and retained backups |
| Background updates | Platform-managed order lifecycle | Firebase background synchronization remains blocked; do not imply Zomato-level notification parity |

## Brand separation

Partner app: **Cartlyft Partner**, red `#D92344`, white Cartlyft cart/cloche/flame mark. Android 7 vector launcher and Android 8+ adaptive icon. Tenant identity (Momo Wala, Dosa Wala, etc.) remains inside the partner app. Keep the existing package and signing certificate so upgrades retain local reports and login state.

Future customer app: reserve green `#10865B`, Cartlyft consumer identity, separate package/signing/release channel. It is not implemented or released in this partner update. User stated this is for later.

## Customer app scope for a later project phase

1. Tenant/cart discovery with truthful opening status, location, menu availability and prices.
2. Cart/checkout with server-authoritative pricing, stock reservation and idempotent order creation.
3. Payment gateway integration with signed webhooks, refunds, payment reconciliation and no card data stored by Cartlyft.
4. Order acceptance, preparation and handover/delivery tracking. Define pickup versus delivery operations before promising map tracking.
5. Customer accounts, order history, support, privacy/retention and tenant-isolated access.
6. Push notifications with device registration/revocation and operational observability; test interrupted connectivity and payment callbacks.

Payment provider, delivery model and production credentials remain decisions for that later scope. Do not copy Zomato branding or imply affiliation.
