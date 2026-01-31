# Changelog

All notable changes to Spam Guard will be documented in this file.

## [1.0.1] - 2025-01-31

### Added
- Account selector: scan single account or all accounts
- 10 days scan option for quick scans

### Changed
- Simplified UI: merged settings buttons, removed scan selected
- Support multiple spam headers (X-Spam-Status, X-Spam-Flag, etc.)

### Fixed
- Action buttons (Move, Safe, View) now work correctly
- Fixed column widths in results table

## [1.0.0] - 2025-01-30

### Added
- Initial release
- Header detection for common spam headers
- TF-IDF + Naive Bayes ML classifier
- Auto-scan new incoming emails
- Configurable detection threshold (50%-90%)
- Configurable auto-move threshold (95%-100%)
- Results page with sortable columns
- Batch operations (Move, Safe, View)
- Train from Spam/Inbox folders
- Desktop notifications
- Progress bar during scanning
- Support for English and Chinese
