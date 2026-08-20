# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.15.0]

### Added

- A searchable "From your history" browser surfaces every distinct food (and every named meal combo) you've logged before, with a one-tap "Add" using the amount/unit you last logged it with, a "Custom amount" option, and "Add meal" to re-log a whole past combo at once. Available on both Log Food and History's inline add-entry panel.

## [0.14.0]

### Fixed

- Added `viewport-fit=cover` to the viewport meta tag and padded the top bar with `env(safe-area-inset-top)`. This allows the app background to flow continuously behind the home indicator at the bottom and the status bar at the top, eliminating non-matching background blocks.

## [0.13.0]

### Added

- PWA status bar theme-color is now dynamically synchronized with the light, dark, and system appearance modes, preventing a white top bar when running in dark mode.

### Fixed

- Resized the brand green square in PWA/iOS icons to 50% of the canvas size to ensure it fits entirely within circular/adaptive OS icon masks without corners being cropped.

## [0.12.0]

### Added

- Food search results can now be prioritized to show unbranded options on top. The API fetches a larger pool of 100 results from Open Food Facts, stably sorts unbranded/brandless products to the top, and returns the top 20 items. This helps users log raw or basic ingredients more easily without scrolling through brand-specific alternatives.

## [0.11.0]

### Added

- brennkonto is now an installable PWA: a web app manifest and a service worker (via `vite-plugin-pwa`) precache the app shell and fonts, so it can be added to your home screen and the interface itself still loads with no connection. Logging in and fetching data still requires reaching the server - this doesn't add offline data yet.
- A dedicated "Can't connect" screen replaces the login/loading flow when the very first request to the server fails outright (no connection, server unreachable), with a Retry action - previously this could misread as "logged out" and bounce you to the login page.
- A persistent banner appears across the app whenever the browser reports no network connection, so a dropped connection mid-session is obvious instead of pages silently failing to refresh.

### Fixed

- Login and Register's brand mark referenced a CSS class that didn't exist, so it silently rendered as nothing.

### Added

- Every logged entry, on any day, now has "Repeat today" and "Repeat with changes" actions: the first instantly re-logs the same food and amount for today, the second opens an amount field first so a different portion can be logged. Both always land on today's log regardless of which day's entries are being browsed - the fast way to re-log something you ate again without re-searching for it.
- Meal groups with more than one item also get a "Repeat meal today" action on the group header, re-logging every item at once and regrouping the copies under the same name.

## [0.9.0]

### Added

- History page can now add entries directly for the day being viewed - search, barcode lookup/scan, and favorites (with their saved default amount shown and a "Custom amount" action for a one-off portion, matching Log Food), without leaving History or going through Log Food.
- Entry portions are now retroactively editable: the existing "Edit" action on a logged entry also lets you correct the amount (not just the date/time it was logged), recomputing calories/macros from the new amount in whatever unit it was originally logged in.

### Changed

- `PATCH /entries/{id}` accepts an optional `input_amount`, used to keep the displayed amount in sync when a portion is corrected; omitted on a time-only edit, which leaves the amount untouched.

## [0.8.0]

### Changed

- Replaced the favorites "Add & Edit" action, which confusingly opened the full amount form and could silently overwrite the saved default. It's now two clearer actions: "Custom amount" asks only for a one-off portion and logs it instantly like "Add", and a new "Edit" action changes the favorite's own saved default amount/unit without logging anything.

## [0.7.0]

### Added

- Favorites: save a food from search/barcode results (star toggle) or from the amount form ("Save as favorite"), optionally with a default amount to skip the amount form entirely on future logs.
- Log Food page has a new Favorites card with "Add" (instant log using the saved default, or opens the amount form if there isn't one) and "Add & Edit" (always opens the amount form, pre-filled with the default if set) actions per favorite, plus "Remove" to un-favorite.
- The amount form's "Save as favorite" checkbox has a nested "Remember this amount as the default" option, so saving a one-off larger portion doesn't silently overwrite the saved default unless asked.

## [0.6.0]

### Added

- Daily calorie/macro goals are now versioned by date instead of a single mutable value: you can retroactively correct what a goal was on a past date, or schedule one to take effect on a future date, without disturbing any other date's goal.
- Historical fulfillment (History page, Trends' goal line, Dashboard's calorie ring) now stays accurate after a goal change - each day always shows the goal that was actually in effect on it, not today's live value.
- New "Goal history" page (linked from Settings, not in the main navigation) lists every goal as a date range, showing the day-before-the-next-version end date for past goals and "ongoing" for the current one.
- History page shows a new "Last 14 days" chart of % of calorie goal met per day, with a dashed line at 100%.

### Changed

- Settings' Daily goals card is now a lightweight summary of today's active goal with a link to the dedicated Goal history page, rather than an inline edit form.
- Usernames can no longer be changed via the Settings page or the account API - they're fixed once set.

### Fixed

- Trends' calorie-goal reference line previously always used your current live goal, even when viewing a custom date range from before it changed - it now reflects the goal that was actually in effect for the range being viewed.

## [0.5.0]

### Changed

- Further tightened mobile spacing: shrunk button/input heights and the page heading, shrunk the calorie ring, and reduced padding and margins across cards, entry rows, meal groups, macro bars, and form fields.
- Removed the excess empty space below the last card on every mobile page, which was over-padded to clear the fixed tab bar.
- The History date range controls (Prev / date / Next) are now centered on mobile instead of left-aligned.

## [0.4.0]

### Added

- Drag-and-drop meal grouping: drag one entry onto another (or onto an existing group) to merge them, replacing the old checkbox-and-button flow.
- Every entry always belongs to a real, nameable meal group, even a group of one, so any single entry can be renamed the same way a multi-item group can.
- Dragging the last entry out of a group deletes the now-empty group automatically.
- Each entry row has a dedicated drag handle instead of the whole row being draggable, so touch-scrolling through the list no longer gets hijacked on mobile.

### Changed

- Meal group boxes now show a "Name this meal" placeholder instead of an invisible, unclickable empty label when unnamed.
- Entry rows on mobile no longer overflow or clip their Edit/Remove buttons off-screen; actions now wrap onto their own row on narrow widths.
- Tightened spacing on mobile (cards, stat tiles, entry rows, date range controls) so more fits on screen.
- The drag-over highlight now has breathing room from the row's content instead of touching it.

## [0.3.0]

### Added

- Favicon using the app's green brand mark.
- Meal groups can now be created from a single selected entry, not just two or more.
- Every logged entry always shows its logged time, not just while editing it.
- Appearance setting with a Light/Auto/Dark theme switch on the Settings page.

### Changed

- Editing an entry's logged date/time now uses a single combined field instead of separate Date and Time inputs.
- Log out is now an icon-only button instead of a text button.
- A meal group with no name is shown nameless instead of falling back to a generic "Meal" label.

## [0.2.0]

### Added

- Meal grouping: select entries and group them together, with retroactive re-grouping and ungrouping.
- Data-driven amount units: logging a food now offers the unit reported for that product (count, kg, L, oz, etc.), not just grams, while calculations always use grams under the hood.
- Editable log time: entries now record a full date and time, and both can be corrected retroactively.
- Soft delete: removing an entry asks for confirmation and moves it to a per-day "removed" list, from which it can be restored or permanently deleted.
- Global `created_at`/`updated_at` tracking on accounts and food entries.

### Changed

- User and food entry ids are now UUIDs instead of sequential numbers.

### Fixed

- The amount input no longer left a stray leading zero when typing (e.g. `0521` instead of `521`).
- The entry list's selection checkboxes were misaligned and pushed the Edit/Remove buttons onto their own line.

## [0.1.0]

### Added

- Calorie and macro tracking with configurable daily goals.
- Food search and barcode lookup via Open Food Facts, with a local product cache.
- Camera-based barcode scanning.
- Daily dashboard/diary view.
- History browsing by day.
- Trends charts with day/week/month grouping.
- Account settings: profile, goals, password.
- Username-or-email login.
- Registration gated behind `REGISTRATION_ENABLED` (disabled by default).
