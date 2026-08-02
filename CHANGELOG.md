# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
