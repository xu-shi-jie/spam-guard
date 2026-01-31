// Spam Guard - Background Script
// Detects spam headers and uses ML classifier

// Configurable spam headers to detect
const SPAM_HEADERS = [
  { header: "x-spam-status", value: "Yes" },
  { header: "x-spam-flag", value: "YES" },
  { header: "x-hines-imss-spam", value: "SPAM" }
];

// ============================================
// TF-IDF Naive Bayes Classifier
// ============================================

class TfIdfNaiveBayes {
  constructor() {
    this.vocabulary = new Map();
    this.documentFrequency = new Map();
    this.totalDocuments = 0;
    this.classDocCount = { spam: 0, ham: 0 };
    this.classWordCounts = { spam: new Map(), ham: new Map() };
    this.classTotalWords = { spam: 0, ham: 0 };
    this.alpha = 1.0;
    this.minDf = 2;  // Minimum document frequency
    this.isTrained = false;
  }

  tokenize(text) {
    if (!text) return [];
    text = text.toLowerCase();
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    // Remove URLs but keep domain as feature
    text = text.replace(/https?:\/\/([^\s\/]+)[^\s]*/g, ' $1 ');
    // Keep email addresses as features (extract domain)
    text = text.replace(/[\w.-]+@([\w.-]+)/g, ' $1 ');
    // Keep alphanumeric and Chinese characters
    text = text.replace(/[^\w\u4e00-\u9fff@.-]/g, ' ');
    return text.split(/\s+/).filter(w => w.length > 1);
  }

  // Extract features from email: sender, email, subject, body
  extractFeatures(emailData) {
    const features = [];

    // Sender name features (with prefix)
    if (emailData.senderName) {
      const nameTokens = this.tokenize(emailData.senderName);
      features.push(...nameTokens.map(t => `name_${t}`));
    }

    // Sender email features (domain)
    if (emailData.senderEmail) {
      const emailMatch = emailData.senderEmail.match(/@([\w.-]+)/);
      if (emailMatch) {
        features.push(`domain_${emailMatch[1].toLowerCase()}`);
        // Also add TLD
        const tld = emailMatch[1].split('.').pop();
        features.push(`tld_${tld}`);
      }
    }

    // Subject features (with prefix for important words)
    if (emailData.subject) {
      const subjectTokens = this.tokenize(emailData.subject);
      features.push(...subjectTokens.map(t => `subj_${t}`));
      features.push(...subjectTokens);  // Also add without prefix
    }

    // Body features
    if (emailData.body) {
      const bodyTokens = this.tokenize(emailData.body);
      features.push(...bodyTokens);
    }

    return features;
  }

  termFrequency(words) {
    const tf = new Map();
    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }
    const docLength = words.length || 1;
    for (const [word, count] of tf) {
      tf.set(word, count / docLength);
    }
    return tf;
  }

  idf(word) {
    const df = this.documentFrequency.get(word) || 0;
    if (df === 0) return 0;
    return Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
  }

  tfidfFromFeatures(features) {
    const tf = this.termFrequency(features);
    const tfidfVector = new Map();
    for (const [word, tfValue] of tf) {
      tfidfVector.set(word, tfValue * this.idf(word));
    }
    return tfidfVector;
  }

  train(trainingData) {
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.classWordCounts = { spam: new Map(), ham: new Map() };
    this.classTotalWords = { spam: 0, ham: 0 };
    this.classDocCount = { spam: 0, ham: 0 };
    this.totalDocuments = trainingData.length;

    if (trainingData.length === 0) {
      console.log("[Classifier] No training data provided");
      return;
    }

    for (const item of trainingData) {
      // Support both old format (text) and new format (emailData)
      let features;
      if (item.emailData) {
        features = this.extractFeatures(item.emailData);
      } else if (item.text) {
        features = this.tokenize(item.text);
      } else {
        continue;
      }

      const label = item.label;
      const uniqueWords = new Set(features);

      for (const word of uniqueWords) {
        this.documentFrequency.set(word, (this.documentFrequency.get(word) || 0) + 1);
      }

      this.classDocCount[label]++;

      for (const word of features) {
        const counts = this.classWordCounts[label];
        counts.set(word, (counts.get(word) || 0) + 1);
        this.classTotalWords[label]++;
      }
    }

    // Build vocabulary (filter by minDf)
    let idx = 0;
    for (const [word, df] of this.documentFrequency) {
      if (df >= this.minDf) {
        this.vocabulary.set(word, idx++);
      }
    }

    this.isTrained = true;
    console.log(`[Classifier] Trained with ${trainingData.length} docs (spam: ${this.classDocCount.spam}, ham: ${this.classDocCount.ham}), vocab: ${this.vocabulary.size}`);
  }

  predict(emailData) {
    if (!this.isTrained) {
      return { label: 'unknown', probability: 0, scores: {} };
    }

    // Support both string and emailData object
    let features;
    if (typeof emailData === 'string') {
      features = this.tokenize(emailData);
    } else {
      features = this.extractFeatures(emailData);
    }

    const tfidfVec = this.tfidfFromFeatures(features);
    const logProbs = {};
    const vocabSize = this.vocabulary.size || 1;

    for (const label of ['spam', 'ham']) {
      const priorProb = (this.classDocCount[label] + this.alpha) /
                        (this.totalDocuments + 2 * this.alpha);
      let logProb = Math.log(priorProb);
      const wordCounts = this.classWordCounts[label];
      const totalWords = this.classTotalWords[label];

      for (const [word, tfidfValue] of tfidfVec) {
        if (!this.vocabulary.has(word)) continue;
        const wordCount = wordCounts.get(word) || 0;
        const wordProb = (wordCount + this.alpha) / (totalWords + this.alpha * vocabSize);
        logProb += Math.log(wordProb) * tfidfValue;
      }
      logProbs[label] = logProb;
    }

    const maxLogProb = Math.max(logProbs.spam, logProbs.ham);
    const expSpam = Math.exp(logProbs.spam - maxLogProb);
    const expHam = Math.exp(logProbs.ham - maxLogProb);
    const sumExp = expSpam + expHam;

    const probabilities = { spam: expSpam / sumExp, ham: expHam / sumExp };
    const predictedLabel = probabilities.spam > probabilities.ham ? 'spam' : 'ham';

    return {
      label: predictedLabel,
      probability: probabilities[predictedLabel],
      scores: probabilities
    };
  }

  getTopFeatures(emailData, n = 10) {
    let features;
    if (typeof emailData === 'string') {
      features = this.tokenize(emailData);
    } else {
      features = this.extractFeatures(emailData);
    }

    const tfidfVec = this.tfidfFromFeatures(features);
    return Array.from(tfidfVec.entries())
      .filter(([word]) => this.vocabulary.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word, score]) => ({ word, score: score.toFixed(4) }));
  }

  serialize() {
    return {
      vocabulary: Array.from(this.vocabulary.entries()),
      documentFrequency: Array.from(this.documentFrequency.entries()),
      totalDocuments: this.totalDocuments,
      classDocCount: this.classDocCount,
      classWordCounts: {
        spam: Array.from(this.classWordCounts.spam.entries()),
        ham: Array.from(this.classWordCounts.ham.entries())
      },
      classTotalWords: this.classTotalWords,
      isTrained: this.isTrained
    };
  }

  deserialize(data) {
    if (!data) return;
    this.vocabulary = new Map(data.vocabulary || []);
    this.documentFrequency = new Map(data.documentFrequency || []);
    this.totalDocuments = data.totalDocuments || 0;
    this.classDocCount = data.classDocCount || { spam: 0, ham: 0 };
    this.classWordCounts = {
      spam: new Map(data.classWordCounts?.spam || []),
      ham: new Map(data.classWordCounts?.ham || [])
    };
    this.classTotalWords = data.classTotalWords || { spam: 0, ham: 0 };
    this.isTrained = data.isTrained || false;
  }
}

// ============================================
// Main Extension Code
// ============================================

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  targetFolderId: null,
  targetFolderPath: "Spam",
  autoScan: true,
  notifyOnMove: true,
  logActions: true,
  useMLClassifier: true,
  mlThreshold: 0.7,
  scanDaysRange: 50,
  maxTrainingSamples: 500  // Max samples per class for training
};

// Storage for settings
let settings = { ...DEFAULT_SETTINGS };

// Statistics
let stats = {
  scannedCount: 0,
  movedCount: 0,
  lastScanTime: null
};

// Scan progress tracking
let scanProgress = {
  isScanning: false,
  currentFolder: "",
  scannedCount: 0,
  movedCount: 0,
  totalFolders: 0,
  currentFolderIndex: 0,
  predictions: []
};

// Training progress
let trainingProgress = {
  isTraining: false,
  status: "",
  spamCount: 0,
  hamCount: 0
};

// ML Classifier instance
let classifier = new TfIdfNaiveBayes();
let trainingData = [];

// Initialize extension
async function initialize() {
  console.log("[Spam Guard] Initializing...");

  // Load settings
  const stored = await browser.storage.local.get("settings");
  if (stored.settings) {
    settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  }

  // Load stats
  const storedStats = await browser.storage.local.get("stats");
  if (storedStats.stats) {
    stats = { ...stats, ...storedStats.stats };
  }

  // Load training data
  const storedTraining = await browser.storage.local.get("trainingData");
  if (storedTraining.trainingData && storedTraining.trainingData.length > 0) {
    trainingData = storedTraining.trainingData;
  }

  // Load or train classifier
  const storedModel = await browser.storage.local.get("classifierModel");
  if (storedModel.classifierModel && storedModel.classifierModel.isTrained) {
    classifier.deserialize(storedModel.classifierModel);
    console.log("[Spam Guard] Classifier model loaded from storage");
  } else {
    // First time: train from mailbox folders
    console.log("[Spam Guard] No trained model found, will train from mailbox folders");
    await trainFromMailboxFolders();
  }

  console.log("[Spam Guard] Settings loaded:", settings);

  if (settings.autoScan) {
    setupMessageListener();
  }
}

// ============================================
// Training from Mailbox Folders
// ============================================

// Parse sender string to extract name and email
function parseSender(author) {
  if (!author) return { name: "", email: "" };

  // Format: "Name <email@domain.com>" or just "email@domain.com"
  const match = author.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  // Just email
  if (author.includes("@")) {
    return { name: "", email: author.trim() };
  }

  return { name: author.trim(), email: "" };
}

// Get message body text
async function getMessageBodyText(messageId) {
  try {
    const messagePart = await browser.messages.getFull(messageId);
    let bodyText = "";

    function extractText(part) {
      if (part.contentType && part.contentType.startsWith("text/plain") && part.body) {
        bodyText += part.body + " ";
      } else if (part.contentType && part.contentType.startsWith("text/html") && part.body) {
        // Strip HTML tags for HTML content
        bodyText += part.body.replace(/<[^>]*>/g, ' ') + " ";
      }
      if (part.parts) {
        for (const subpart of part.parts) {
          extractText(subpart);
        }
      }
    }

    extractText(messagePart);
    return bodyText.substring(0, 5000); // Limit body length
  } catch (error) {
    console.error("[Spam Guard] Error getting body:", error);
    return "";
  }
}

// Collect training data from a folder
async function collectTrainingDataFromFolder(folder, label, maxSamples) {
  const samples = [];

  try {
    let page = await browser.messages.list(folder);
    let count = 0;

    while (page && count < maxSamples) {
      for (const message of page.messages) {
        if (count >= maxSamples) break;

        try {
          const sender = parseSender(message.author);
          const body = await getMessageBodyText(message.id);

          samples.push({
            label: label,
            emailData: {
              senderName: sender.name,
              senderEmail: sender.email,
              subject: message.subject || "",
              body: body
            }
          });

          count++;
        } catch (e) {
          console.error("[Training] Error processing message:", e);
        }
      }

      if (page.id && count < maxSamples) {
        page = await browser.messages.continueList(page.id);
      } else {
        page = null;
      }
    }

    console.log(`[Training] Collected ${samples.length} ${label} samples from ${folder.path}`);
  } catch (error) {
    console.error(`[Training] Error collecting from ${folder.path}:`, error);
  }

  return samples;
}

// Find spam/junk folders for all accounts
async function findSpamFolders() {
  const spamFolders = [];
  const accounts = await browser.accounts.list();
  const spamNames = ["spam", "junk", "垃圾邮件", "垃圾箱", "bulk"];

  function searchFolders(folders, accountId) {
    for (const folder of folders) {
      const lowerName = folder.name.toLowerCase();
      const lowerPath = folder.path.toLowerCase();

      if (folder.type === "junk" ||
          spamNames.some(name => lowerName === name || lowerPath.includes(name))) {
        spamFolders.push({ ...folder, accountId });
      }

      if (folder.subFolders && folder.subFolders.length > 0) {
        searchFolders(folder.subFolders, accountId);
      }
    }
  }

  for (const account of accounts) {
    searchFolders(account.folders, account.id);
  }

  return spamFolders;
}

// Find inbox folders for all accounts
async function findInboxFolders() {
  const inboxFolders = [];
  const accounts = await browser.accounts.list();

  for (const account of accounts) {
    for (const folder of account.folders) {
      if (folder.type === "inbox") {
        inboxFolders.push({ ...folder, accountId: account.id });
      }
    }
  }

  return inboxFolders;
}

// Train classifier from mailbox folders
async function trainFromMailboxFolders() {
  console.log("[Spam Guard] Training from mailbox folders...");

  trainingProgress = {
    isTraining: true,
    status: "Finding folders...",
    spamCount: 0,
    hamCount: 0
  };

  try {
    const maxPerClass = settings.maxTrainingSamples || 500;
    let allTrainingData = [];

    // Step 1: Collect spam samples from Spam/Junk folders (positive samples)
    trainingProgress.status = "Collecting spam samples from Spam/Junk folders...";
    const spamFolders = await findSpamFolders();
    console.log(`[Training] Found ${spamFolders.length} spam folders`);

    let spamSamples = [];
    const spamPerFolder = Math.ceil(maxPerClass / Math.max(spamFolders.length, 1));

    for (const folder of spamFolders) {
      if (spamSamples.length >= maxPerClass) break;
      const samples = await collectTrainingDataFromFolder(
        folder,
        "spam",
        Math.min(spamPerFolder, maxPerClass - spamSamples.length)
      );
      spamSamples = spamSamples.concat(samples);
      trainingProgress.spamCount = spamSamples.length;
    }

    console.log(`[Training] Collected ${spamSamples.length} spam samples`);

    // Step 2: Collect SAME number of ham samples from Inbox folders (negative samples)
    // This ensures balanced training data
    const targetHamCount = spamSamples.length;
    trainingProgress.status = `Collecting ${targetHamCount} ham samples from Inbox...`;

    const inboxFolders = await findInboxFolders();
    console.log(`[Training] Found ${inboxFolders.length} inbox folders`);

    let hamSamples = [];
    const hamPerFolder = Math.ceil(targetHamCount / Math.max(inboxFolders.length, 1));

    for (const folder of inboxFolders) {
      if (hamSamples.length >= targetHamCount) break;
      const samples = await collectTrainingDataFromFolder(
        folder,
        "ham",
        Math.min(hamPerFolder, targetHamCount - hamSamples.length)
      );
      hamSamples = hamSamples.concat(samples);
      trainingProgress.hamCount = hamSamples.length;
    }

    console.log(`[Training] Collected ${hamSamples.length} ham samples (target: ${targetHamCount})`);

    // Combine training data (balanced: spam count = ham count)
    allTrainingData = spamSamples.concat(hamSamples);

    if (allTrainingData.length < 10) {
      console.log("[Training] Not enough training data, using defaults");
      // Use minimal default data if not enough real data
      allTrainingData = getDefaultTrainingData();
    }

    // Shuffle training data
    for (let i = allTrainingData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTrainingData[i], allTrainingData[j]] = [allTrainingData[j], allTrainingData[i]];
    }

    // Train classifier
    trainingProgress.status = "Training classifier...";
    trainingData = allTrainingData;
    classifier.train(trainingData);

    // Save
    await saveTrainingData();
    await saveClassifierModel();

    trainingProgress.status = "Complete!";
    trainingProgress.isTraining = false;

    console.log(`[Spam Guard] Training complete: ${spamSamples.length} spam, ${hamSamples.length} ham`);

    return {
      success: true,
      spamCount: spamSamples.length,
      hamCount: hamSamples.length
    };

  } catch (error) {
    console.error("[Spam Guard] Training error:", error);
    trainingProgress.status = "Error: " + error.message;
    trainingProgress.isTraining = false;
    return { success: false, error: error.message };
  }
}

// Default training data as fallback
function getDefaultTrainingData() {
  return [
    { label: "spam", emailData: { senderName: "Prize Winner", senderEmail: "winner@lottery.com", subject: "Congratulations! You've won!", body: "Click here to claim your free prize iPhone lottery winner" }},
    { label: "spam", emailData: { senderName: "Security Alert", senderEmail: "security@fake-bank.com", subject: "URGENT: Account compromised", body: "Verify your password immediately suspicious activity detected" }},
    { label: "spam", emailData: { senderName: "Make Money", senderEmail: "rich@fastcash.net", subject: "Earn $5000 per week!", body: "Work from home make money fast easy income opportunity" }},
    { label: "spam", emailData: { senderName: "Special Offer", senderEmail: "deals@discount-store.com", subject: "90% OFF Limited time!", body: "Buy now limited offer discount sale cheap prices" }},
    { label: "spam", emailData: { senderName: "Pharmacy", senderEmail: "meds@online-pharmacy.biz", subject: "Best prices on medications", body: "viagra cialis prescription drugs cheap online pharmacy" }},
    { label: "spam", emailData: { senderName: "中奖通知", senderEmail: "prize@lucky88.cn", subject: "恭喜您中奖了！", body: "点击领取奖品 免费赠送 立即获取 限时优惠" }},
    { label: "spam", emailData: { senderName: "贷款服务", senderEmail: "loan@fastmoney.cn", subject: "快速贷款审批", body: "无需抵押 当天放款 低息贷款 快速审批" }},
    { label: "ham", emailData: { senderName: "John Smith", senderEmail: "john.smith@company.com", subject: "Meeting tomorrow", body: "Hi, just wanted to follow up on our meeting. Can we schedule a call?" }},
    { label: "ham", emailData: { senderName: "HR Department", senderEmail: "hr@company.com", subject: "Quarterly report", body: "Please find attached the quarterly report for your review." }},
    { label: "ham", emailData: { senderName: "Amazon", senderEmail: "shipping@amazon.com", subject: "Your order has shipped", body: "Thank you for your order. Your package will arrive in 3-5 business days." }},
    { label: "ham", emailData: { senderName: "Team Lead", senderEmail: "lead@company.com", subject: "Team meeting reminder", body: "Reminder: Team meeting tomorrow at 10am in conference room B." }},
    { label: "ham", emailData: { senderName: "Project Manager", senderEmail: "pm@company.com", subject: "Project update", body: "The project deadline has been extended to next Friday. Please review the attached timeline." }},
    { label: "ham", emailData: { senderName: "张经理", senderEmail: "zhang@company.cn", subject: "工作报告", body: "您好，附件是本月的工作报告，请查收。" }},
    { label: "ham", emailData: { senderName: "会议通知", senderEmail: "admin@company.cn", subject: "明天会议", body: "会议通知：明天上午10点在会议室开会，请准时参加。" }}
  ];
}

// ============================================
// Message Processing
// ============================================

// Get message headers
async function getMessageHeaders(messageId) {
  try {
    const messagePart = await browser.messages.getFull(messageId);
    return messagePart.headers || {};
  } catch (error) {
    console.error("[Spam Guard] Error getting headers:", error);
    return {};
  }
}

// Check if message has spam header
function hasSpamHeader(headers) {
  for (const check of SPAM_HEADERS) {
    const headerValue = headers[check.header];
    if (headerValue) {
      for (const value of headerValue) {
        if (value.toUpperCase().includes(check.value.toUpperCase())) {
          return true;
        }
      }
    }
  }
  return false;
}

// Find spam folder for an account
async function findSpamFolder(accountId) {
  if (settings.targetFolderId) {
    try {
      const folder = await browser.folders.get(settings.targetFolderId);
      if (folder) return folder;
    } catch (e) {
      console.log("[Spam Guard] Configured folder not found");
    }
  }

  const account = await browser.accounts.get(accountId);
  if (!account) return null;

  const spamNames = ["spam", "junk", "垃圾邮件", "垃圾箱", settings.targetFolderPath.toLowerCase()];

  function searchFolders(folders) {
    for (const folder of folders) {
      const lowerName = folder.name.toLowerCase();
      const lowerPath = folder.path.toLowerCase();
      if (folder.type === "junk" ||
          spamNames.some(name => lowerName === name || lowerPath.includes(name))) {
        return folder;
      }
      if (folder.subFolders && folder.subFolders.length > 0) {
        const found = searchFolders(folder.subFolders);
        if (found) return found;
      }
    }
    return null;
  }

  return searchFolders(account.folders);
}

// Show notification
function showNotification(title, message) {
  browser.notifications.create({
    type: "basic",
    title: title,
    message: message,
    iconUrl: "icons/icon-48.png"
  });
}

// Check message and optionally move
async function checkAndMoveMessage(message, collectOnly = false) {
  if (!settings.enabled) return { isSpam: false };

  try {
    stats.scannedCount++;
    const headers = await getMessageHeaders(message.id);

    // Check header first
    if (hasSpamHeader(headers)) {
      console.log(`[Spam Guard] Header spam: ${message.subject}`);

      if (!collectOnly) {
        const spamFolder = await findSpamFolder(message.folder.accountId);
        if (spamFolder && message.folder.path !== spamFolder.path) {
          await browser.messages.move([message.id], spamFolder);
          stats.movedCount++;
          await saveStats();

          // Show notification if enabled
          if (settings.notifyOnMove) {
            showNotification(
              "Spam Detected (Header)",
              `Moved: ${message.subject || "(No subject)"}`
            );
          }
        }
      }

      return {
        isSpam: true,
        method: "header",
        probability: 1.0,
        topKeywords: []
      };
    }

    // ML classification
    if (settings.useMLClassifier && classifier.isTrained) {
      const sender = parseSender(message.author);
      const body = await getMessageBodyText(message.id);

      const emailData = {
        senderName: sender.name,
        senderEmail: sender.email,
        subject: message.subject || "",
        body: body
      };

      const prediction = classifier.predict(emailData);

      if (prediction.label === "spam" && prediction.scores.spam >= settings.mlThreshold) {
        const topKeywords = classifier.getTopFeatures(emailData, 5);

        console.log(`[Spam Guard] ML spam (${(prediction.scores.spam * 100).toFixed(1)}%): ${message.subject}`);

        // Auto-move ML detected spam if confidence exceeds auto-move threshold
        const autoMoveThreshold = settings.autoMoveThreshold || 0.99;
        if (!collectOnly && settings.autoScan && prediction.scores.spam >= autoMoveThreshold) {
          const spamFolder = await findSpamFolder(message.folder.accountId);
          if (spamFolder && message.folder.path !== spamFolder.path) {
            await browser.messages.move([message.id], spamFolder);
            stats.movedCount++;
            await saveStats();

            // Show notification if enabled
            if (settings.notifyOnMove) {
              showNotification(
                "Spam Detected (ML)",
                `Moved: ${message.subject || "(No subject)"}\nConfidence: ${(prediction.scores.spam * 100).toFixed(0)}%`
              );
            }
          }
        }

        return {
          isSpam: true,
          method: "ml",
          probability: prediction.scores.spam,
          topKeywords: topKeywords
        };
      }
    }

    return { isSpam: false };
  } catch (error) {
    console.error("[Spam Guard] Error checking message:", error);
    return { isSpam: false };
  }
}

// Check if message is within date range
function isWithinDateRange(message, daysRange) {
  if (!message.date || !daysRange) return true;
  const messageDate = new Date(message.date);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysRange);
  return messageDate >= cutoffDate;
}

// ============================================
// Scanning Functions
// ============================================

// Scan folder with ML predictions
async function scanFolderWithML(folder, recursive = false, updateProgress = false, daysRange = null) {
  if (!settings.enabled) return { scanned: 0, predictions: [] };

  let scanned = 0;
  let predictions = [];

  try {
    if (updateProgress) {
      scanProgress.currentFolder = folder.path || folder.name;
    }

    let page = await browser.messages.list(folder);

    while (page) {
      for (const message of page.messages) {
        if (!isWithinDateRange(message, daysRange)) {
          continue;
        }

        scanned++;
        if (updateProgress) {
          scanProgress.scannedCount++;
        }

        const result = await checkAndMoveMessage(message, true);

        if (result.isSpam) {
          predictions.push({
            messageId: message.id,
            subject: message.subject,
            sender: message.author,
            date: message.date,
            folder: folder.path,
            method: result.method,
            probability: result.probability,
            topKeywords: result.topKeywords,
            bodyPreview: ""
          });

          if (updateProgress) {
            scanProgress.movedCount++;
          }
        }
      }

      if (page.id) {
        page = await browser.messages.continueList(page.id);
      } else {
        page = null;
      }
    }

    if (recursive && folder.subFolders) {
      for (const subfolder of folder.subFolders) {
        const subResult = await scanFolderWithML(subfolder, true, updateProgress, daysRange);
        scanned += subResult.scanned;
        predictions = predictions.concat(subResult.predictions);
      }
    }
  } catch (error) {
    console.error("[Spam Guard] Error scanning folder:", error);
  }

  return { scanned, predictions };
}

// Count folders
function countFolders(folders, skipTypes) {
  let count = 0;
  for (const folder of folders) {
    if (!skipTypes.includes(folder.type)) {
      count++;
      if (folder.subFolders) {
        count += countFoldersRecursive(folder.subFolders);
      }
    }
  }
  return count;
}

function countFoldersRecursive(folders) {
  let count = folders.length;
  for (const folder of folders) {
    if (folder.subFolders) {
      count += countFoldersRecursive(folder.subFolders);
    }
  }
  return count;
}

// Scan all accounts with ML
async function scanAllAccountsWithML(daysRange = null, accountId = null) {
  if (!settings.enabled) return { scanned: 0, predictions: [] };

  const effectiveDaysRange = daysRange || settings.scanDaysRange;

  scanProgress = {
    isScanning: true,
    currentFolder: "",
    scannedCount: 0,
    movedCount: 0,
    totalFolders: 0,
    currentFolderIndex: 0,
    predictions: []
  };

  let totalScanned = 0;
  let allPredictions = [];

  let accounts = await browser.accounts.list();
  const skipTypes = ["junk", "trash", "sent", "drafts", "outbox"];

  // Filter to single account if specified
  if (accountId) {
    accounts = accounts.filter(a => a.id === accountId);
  }

  for (const account of accounts) {
    scanProgress.totalFolders += countFolders(account.folders, skipTypes);
  }

  for (const account of accounts) {
    for (const folder of account.folders) {
      if (!skipTypes.includes(folder.type)) {
        scanProgress.currentFolderIndex++;
        const result = await scanFolderWithML(folder, true, true, effectiveDaysRange);
        totalScanned += result.scanned;
        allPredictions = allPredictions.concat(result.predictions);
      }
    }
  }

  stats.lastScanTime = new Date().toISOString();
  await saveStats();

  const scanResults = {
    totalScanned,
    predictions: allPredictions,
    scanTime: new Date().toISOString(),
    daysRange: effectiveDaysRange
  };
  await browser.storage.local.set({ scanResults });

  scanProgress.isScanning = false;
  scanProgress.predictions = allPredictions;

  return { scanned: totalScanned, predictions: allPredictions };
}

// ============================================
// Utility Functions
// ============================================

// Open results tab
async function openResultsTab() {
  const url = browser.runtime.getURL("results/results.html");
  await browser.tabs.create({ url });
}

// Save statistics
async function saveStats() {
  await browser.storage.local.set({ stats });
}

// Save settings
async function saveSettings() {
  await browser.storage.local.set({ settings });
}

// Save classifier model
async function saveClassifierModel() {
  await browser.storage.local.set({ classifierModel: classifier.serialize() });
}

// Save training data
async function saveTrainingData() {
  await browser.storage.local.set({ trainingData });
}

// Get all folders
async function getAllFolders() {
  const accounts = await browser.accounts.list();
  const folders = [];

  function addFolders(folderList, accountName, depth = 0) {
    for (const folder of folderList) {
      folders.push({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        accountName: accountName,
        type: folder.type,
        depth: depth,
        displayName: "  ".repeat(depth) + folder.name
      });
      if (folder.subFolders && folder.subFolders.length > 0) {
        addFolders(folder.subFolders, accountName, depth + 1);
      }
    }
  }

  for (const account of accounts) {
    addFolders(account.folders, account.name);
  }

  return folders;
}

// Set up listener for new messages
function setupMessageListener() {
  browser.messages.onNewMailReceived.addListener(async (folder, messages) => {
    if (!settings.enabled) return;
    console.log(`[Spam Guard] New mail received: ${messages.messages.length} messages`);
    for (const message of messages.messages) {
      await checkAndMoveMessage(message);
    }
  });
}

// ============================================
// Message Handler
// ============================================

browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log("[Spam Guard] Received:", message.action);

  switch (message.action) {
    case "getSettings":
      return { settings, stats };

    case "saveSettings":
      settings = { ...settings, ...message.settings };
      await saveSettings();
      return { success: true };

    case "getStats":
      return { stats };

    case "resetStats":
      stats = { scannedCount: 0, movedCount: 0, lastScanTime: null };
      await saveStats();
      return { stats };

    case "getAccounts":
      const allAccounts = await browser.accounts.list();
      return { accounts: allAccounts.map(a => ({ id: a.id, name: a.name })) };

    case "scanAll":
      const scanResult = await scanAllAccountsWithML(message.daysRange, message.accountId);
      await openResultsTab();
      return { result: { scanned: scanResult.scanned, moved: scanResult.predictions.length } };

    case "scanSelected":
      const tabs = await browser.mailTabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        const selectedMessages = await browser.mailTabs.getSelectedMessages(tabs[0].id);
        let scanned = 0;
        let predictions = [];
        for (const msg of selectedMessages.messages) {
          scanned++;
          const result = await checkAndMoveMessage(msg, true);
          if (result.isSpam) {
            predictions.push({
              messageId: msg.id,
              subject: msg.subject,
              sender: msg.author,
              date: msg.date,
              method: result.method,
              probability: result.probability,
              topKeywords: result.topKeywords
            });
          }
        }
        const scanResults = {
          totalScanned: scanned,
          predictions,
          scanTime: new Date().toISOString()
        };
        await browser.storage.local.set({ scanResults });
        if (predictions.length > 0) {
          await openResultsTab();
        }
        return { result: { scanned, moved: predictions.length } };
      }
      return { result: { scanned: 0, moved: 0 } };

    case "getFolders":
      const folders = await getAllFolders();
      return { folders };

    case "toggle":
      settings.enabled = !settings.enabled;
      await saveSettings();
      return { enabled: settings.enabled };

    case "getProgress":
      return { progress: scanProgress };

    case "getTrainingProgress":
      return { progress: trainingProgress };

    case "moveMessage":
      try {
        const msgToMove = await browser.messages.get(message.messageId);
        const spamFolder = await findSpamFolder(msgToMove.folder.accountId);
        if (spamFolder) {
          await browser.messages.move([message.messageId], spamFolder);
          return { success: true };
        }
        return { success: false, error: "Spam folder not found" };
      } catch (error) {
        return { success: false, error: error.message };
      }

    case "viewMessage":
      try {
        // Get the message first to verify it exists
        const msg = await browser.messages.get(message.messageId);
        if (!msg) {
          return { success: false, error: "Message not found" };
        }

        // Try to open in a message tab or display in main window
        // First try messageDisplay API (Thunderbird 91+)
        if (browser.messageDisplay && browser.messageDisplay.open) {
          await browser.messageDisplay.open({
            messageId: message.messageId,
            location: "tab"
          });
          return { success: true };
        }

        // Fallback: try to select message in a mail tab
        const tabs = await browser.tabs.query({ mailTab: true });
        if (tabs.length > 0) {
          await browser.mailTabs.setSelectedMessages(tabs[0].id, [message.messageId]);
          await browser.tabs.update(tabs[0].id, { active: true });
          return { success: true };
        }

        return { success: false, error: "No mail tab available" };
      } catch (error) {
        console.error("[Spam Guard] Error viewing message:", error);
        return { success: false, error: error.message };
      }

    case "addTrainingData":
      const newSample = {
        label: message.label,
        emailData: {
          senderName: message.senderName || "",
          senderEmail: message.senderEmail || "",
          subject: message.subject || "",
          body: message.body || message.text || ""
        }
      };
      trainingData.push(newSample);
      await saveTrainingData();
      classifier.train(trainingData);
      await saveClassifierModel();
      return { success: true };

    case "getTrainingData":
      return { trainingData };

    case "retrainClassifier":
      if (message.trainingData) {
        trainingData = message.trainingData;
        await saveTrainingData();
      }
      classifier.train(trainingData);
      await saveClassifierModel();
      return { success: true };

    case "trainFromFolders":
      const trainResult = await trainFromMailboxFolders();
      return trainResult;

    case "getClassifierInfo":
      return {
        isTrained: classifier.isTrained,
        vocabularySize: classifier.vocabulary.size,
        trainingSize: trainingData.length,
        classDistribution: classifier.classDocCount
      };

    default:
      console.warn("[Spam Guard] Unknown action:", message.action);
      return { error: "Unknown action" };
  }
});

// Initialize
initialize();
