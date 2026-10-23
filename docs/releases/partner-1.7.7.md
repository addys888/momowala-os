# Partner 1.7.7 (code 19)

Urgent publication explicitly approved for closing ringtone blocker. Summary Silence alerts now includes closing alerts. Existing ACK action also silences closing keys. Already-acknowledged show requests clear stale playback rather than returning early. Closing status sync explicitly clears server-acknowledged owner reports and submitted manager reports, including missing legacy cart mappings.

No server report acknowledgment is fabricated by local silence. Live read verified October 21 Momo Wala report already acknowledged. No business data changed by this release.

Validation: 37 app tests passed; focused Android 7 closing/silence/redelivery/lock-screen instrumentation passed before release build. Signed release compilation and signature verified; lint 0 errors, 15 warnings. Physical owner phone remains unverified. Partner-only web staging excludes unfinished customer changes. Minimum version policy unchanged.
