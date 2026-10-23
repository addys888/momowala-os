# Partner 1.7.4 (code 16)

User explicitly approved publication on 21 October 2026. Signed artifact: artifacts/partner/cartlyft-partner-1.7.4.apk. Android 7+, same package com.cartlyft.momowala.

Adds manager refill after the day's opening stock: category and quantity, atomic freezer/cart transfer, loading ledger, server manager authorization and persistent retry reference.

Production migration manager_stock_refills applied and RPC/private-table grants verified. Local validation: 37 app tests, 43 existing database tests, 8 refill database tests. Android release build/signature passed; lint 0 errors, 15 warnings. Physical-phone refill UI was not verified.

Web deployment staged in /tmp/cartlyft-partner-174-release from cdf5352 with only OpeningInventory.jsx, StockRefill.jsx, APK/download metadata and install page updates. Unfinished customer application/backend changes excluded from web deployment. APK is the exact previously built 1.7.4 artifact. Minimum supported version policy unchanged.
