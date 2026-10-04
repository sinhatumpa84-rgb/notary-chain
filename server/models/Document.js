const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const docSchema = new mongoose.Schema({
  uniqueDocId: { type: String, unique: true },
  title: { type: String, required: true },
  description: String,
  fileUrl: { type: String, required: true },
  originalFileName: { type: String, required: true },
  fileType: String,
  fileSize: Number,
  mimeType: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['draft', 'pending_verification', 'under_review', 'approved', 'rejected', 'notarized'], default: 'draft' },
  currentVersion: { type: Number, default: 1 },
  versions: [{
    versionNumber: Number,
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    uploadedAt: Date,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changeNotes: String
  }],
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    permission: { type: String, enum: ['read', 'write', 'admin'] },
    sharedAt: Date,
    sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  hash: String,
  fileHash: String,
  documentType: String,
  extractedMetadata: mongoose.Schema.Types.Mixed,
  extractedText: String,
  aiAnalysis: mongoose.Schema.Types.Mixed,
  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'UNVERIFIED', 'PENDING_REVIEW', 'SUSPICIOUS', 'REJECTED', 'ANALYSIS_FAILED', 'draft', 'pending_verification', 'under_review', 'approved', 'notarized'],
    default: 'UNVERIFIED'
  },
  verificationScore: { type: Number, default: null },
  riskScore: { type: Number, default: null },
  verificationReasons: [String],
  suspiciousIndicators: [String],
  hashHistory: [{
    hash: String,
    previousHash: String,
    modifiedAt: { type: Date, default: Date.now },
    reason: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  blockchainRecord: {
    isAnchored: { type: Boolean, default: false },
    txHash: String,
    blockNumber: Number,
    network: { type: String, default: 'Polygon Amoy Testnet (Chain 80002)' },
    anchoredAt: Date,
    verifiedAt: Date,
    onChainHashMatches: Boolean
  },
  uploadedAt: { type: Date, default: Date.now },
  analyzedAt: Date,
  analysisVersion: { type: String, default: '3.0.0-grok' },
  encryptionStatus: String,
  tags: [String],
  category: String,
  metadata: mongoose.Schema.Types.Mixed,
  assignedReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: String,
  reviewedAt: Date,
  notarizedAt: Date,
  notaryCertificateUrl: String,
  expiresAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Indexes
docSchema.index({ uploadedBy: 1 });
docSchema.index({ status: 1 });
docSchema.index({ verificationStatus: 1 });
docSchema.index({ fileHash: 1 });
docSchema.index({ hash: 1 });
docSchema.index({ isDeleted: 1 });
docSchema.index({ createdAt: 1 });
docSchema.index({ title: 'text', description: 'text' });

docSchema.pre('save', function(next) {
  if (this.isNew && !this.uniqueDocId) {
    this.uniqueDocId = uuidv4();
  }
  if (this.hash && !this.fileHash) {
    this.fileHash = this.hash;
  }
  if (!this.originalFileName && this.originalFilename) {
    this.originalFileName = this.originalFilename;
  }
  next();
});

module.exports = mongoose.model('Document', docSchema);
