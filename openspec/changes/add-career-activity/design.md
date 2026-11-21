# Design

Read the first career profile save, saved roadmap versions, and member-authored coach messages. Group timestamps by date in the browser's time zone. The rolling window includes today. The current streak can end yesterday while today is open. Deriving counts from saved records avoids double-counting retries and includes existing history.

Arcshift stores the latest streak snapshot per account. Reads recalculate the snapshot from recorded activity so it rolls over on the next calendar load. Concurrent requests keep the most recently calculated window.
