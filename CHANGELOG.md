# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
