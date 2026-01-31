# Spam Guard - Thunderbird Extension

Intelligent spam detection for Thunderbird using header analysis and ML classification.

## Features

- **Header Detection**: Auto-detect spam headers (X-Spam-Status, X-Spam-Flag, etc.)
- **ML Classifier**: TF-IDF + Naive Bayes classifier for spam detection
- **Auto-scan**: Automatically scan and move spam when new emails arrive
- **Results Page**: View all detected spam in a sortable table with batch operations
- **Configurable Thresholds**:
  - Detection threshold (show in results)
  - Auto-move threshold (automatically move high-confidence spam)
- **Training**: Train from your Spam/Inbox folders, learns from user feedback
- **Progress Display**: Real-time progress bar during scanning

## Installation

### From Release (Recommended)

1. Download the latest `.xpi` file from [Releases](../../releases)
2. Open Thunderbird
3. Go to Menu → Add-ons and Themes
4. Click the gear icon → Install Add-on From File
5. Select the downloaded `.xpi` file

### From Source (Development)

1. Clone this repository
2. Open Thunderbird
3. Go to Menu → Add-ons and Themes
4. Click the gear icon → Debug Add-ons
5. Click "Load Temporary Add-on..."
6. Select the `manifest.json` file

## Usage

### Basic Usage

1. Click the Spam Guard icon in the toolbar
2. Select scan time range (50/100/1000 days or all)
3. Click "Scan All Inboxes"
4. Review results in the popup tab
5. Move spam or mark false positives as safe

### Results Page Actions

- **Move**: Move email to spam folder
- **Safe**: Mark as safe (adds to training data as ham)
- **View**: Open email in Thunderbird
- Supports batch selection and operations
- Sortable columns (Subject, From, Date, Probability)

### Settings

**General:**
- Enable spam detection
- Auto-scan new messages
- Show notifications when moving spam
- Target spam folder

**ML Classifier:**
- Enable ML-based detection
- Detection threshold (50%-90%) - show in results
- Auto-move threshold (95%-100%) - auto-move new emails
- Scan time range

**Training:**
- Train from Spam/Inbox folders
- Retrain with current data

## How It Works

### 1. Header Detection
Detects common spam headers added by email security systems (X-Spam-Status, X-Spam-Flag, etc.).

### 2. ML Classifier
- **Features**: Sender name, email domain, TLD, subject, body (TF-IDF)
- **Algorithm**: Naive Bayes with Laplace smoothing
- **Training**: Learns from Spam/Junk folders (positive) and Inbox (negative)
- **Languages**: English, Chinese supported

### 3. Auto-move Logic
- Header detected → Always move (100% confidence)
- ML detected ≥ auto-move threshold → Auto-move
- ML detected ≥ detection threshold → Show in results for review

## File Structure

```
spam-guard/
├── manifest.json          # Extension manifest
├── background.js          # Background script with ML classifier
├── options/
│   ├── options.html       # Settings page
│   └── options.js
├── popup/
│   ├── popup.html         # Popup window
│   └── popup.js
├── results/
│   ├── results.html       # Results page
│   └── results.js
└── icons/
    └── icon-*.png
```

## Permissions

- `messagesRead`: Read email content and headers
- `messagesMove`: Move emails to spam folder
- `accountsRead`: Read accounts and folder list
- `storage`: Save settings, stats, and ML model
- `notifications`: Show desktop notifications

## Requirements

- Thunderbird 78.0 or higher

## Troubleshooting

**ML detection not accurate**
- Adjust ML confidence threshold
- Mark false positives as "Safe" to improve model
- Click "Train from Spam/Inbox Folders" to retrain

**Scanning too slow**
- Reduce scan time range (e.g., 50 days)
- Disable ML detection to use header detection only

**Auto-move not working**
- Check "Enable spam detection" is on
- Check "Auto-scan new messages" is on
- Verify auto-move threshold setting

## Building

```bash
# Create .xpi package
zip -r spam-guard.xpi manifest.json background.js icons/ options/ popup/ results/ -x "*.md"
```

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
