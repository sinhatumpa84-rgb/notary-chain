/**
 * Metadata Verification Engine for NotaryChain
 * Cross-references file attributes, structural container metadata, and visible extracted content.
 * Distinguishes between concrete evidence and conclusions.
 */

const path = require('path');

/**
 * Validates metadata consistency across multiple dimensions
 * @param {Object} params
 * @param {string} params.filename - Original file name
 * @param {string} params.mimetype - Uploaded MIME type
 * @param {number} params.fileSize - Size in bytes
 * @param {Object} params.technicalMetadata - Extracted PDF/XMP/container metadata
 * @param {Array} params.extractedDates - Dates found in document body
 * @param {Array} params.extractedParties - Named entities in document
 * @returns {Object} { anomalies: [], warnings: [], evidence: [], isConsistent: boolean }
 */
function verifyDocumentMetadata({
  filename = '',
  mimetype = '',
  fileSize = 0,
  technicalMetadata = {},
  extractedDates = [],
  extractedParties = []
}) {
  const anomalies = [];
  const warnings = [];
  const evidence = [];

  const ext = path.extname(filename).toLowerCase().replace('.', '');

  // 1. Extension vs MIME Type Consistency
  const mimeMap = {
    'pdf': ['application/pdf'],
    'png': ['image/png'],
    'jpg': ['image/jpeg', 'image/jpg'],
    'jpeg': ['image/jpeg', 'image/jpg'],
    'webp': ['image/webp'],
    'txt': ['text/plain'],
    'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'doc': ['application/msword']
  };

  const expectedMimes = mimeMap[ext];
  if (expectedMimes && !expectedMimes.includes(mimetype.toLowerCase())) {
    anomalies.push({
      type: 'MIME_EXTENSION_MISMATCH',
      severity: 'HIGH',
      description: `File extension ".${ext}" does not match reported MIME type "${mimetype}".`
    });
  } else {
    evidence.push(`MIME type "${mimetype}" matches file extension ".${ext}".`);
  }

  // 2. File Size Sanity Check
  if (fileSize <= 0) {
    anomalies.push({
      type: 'ZERO_BYTE_FILE',
      severity: 'CRITICAL',
      description: 'Uploaded file has a length of 0 bytes.'
    });
  } else if (fileSize < 64 && ext === 'pdf') {
    anomalies.push({
      type: 'CORRUPTED_PDF_CONTAINER',
      severity: 'HIGH',
      description: 'PDF file is unrealistically small (<64 bytes) and missing header/trailer structure.'
    });
  }

  // 3. Chronological Consistency: PDF Creation vs Modification Timestamps
  const creationStr = technicalMetadata?.creation_timestamp || technicalMetadata?.pdf_creation_date || technicalMetadata?.CreationDate || '';
  const modStr = technicalMetadata?.modification_timestamp || technicalMetadata?.pdf_mod_date || technicalMetadata?.ModDate || '';

  let creationDate = parsePdfDate(creationStr);
  let modDate = parsePdfDate(modStr);

  if (creationDate && creationDate > new Date(Date.now() + 24 * 3600 * 1000)) {
    anomalies.push({
      type: 'FUTURE_CREATION_DATE',
      severity: 'HIGH',
      description: `Container metadata claims creation date in the future (${creationDate.toISOString()}).`
    });
  }

  if (creationDate && modDate && modDate < creationDate) {
    anomalies.push({
      type: 'CHRONOLOGICAL_IMPOSSIBILITY',
      severity: 'MEDIUM',
      description: `File modification timestamp (${modDate.toISOString()}) precedes creation timestamp (${creationDate.toISOString()}).`
    });
  }

  // 4. Content vs Container Date Discrepancy (e.g. Document claims 2021, but PDF generated in 2026)
  if (creationDate && Array.isArray(extractedDates)) {
    for (const d of extractedDates) {
      const docDateStr = typeof d === 'string' ? d : (d.value || d.date || '');
      const docDate = parseGenericDate(docDateStr);
      if (docDate) {
        const yearDiff = Math.abs(creationDate.getFullYear() - docDate.getFullYear());
        if (yearDiff > 2) {
          warnings.push({
            type: 'DATE_DISCREPANCY',
            severity: 'LOW',
            description: `Document content date (${docDate.toDateString()}) differs by ${yearDiff} years from PDF creation date (${creationDate.toDateString()}). Treated as potential indicator, not absolute fraud.`
          });
        }
      }
    }
  }

  // 5. Producer / Software Provenance
  if (technicalMetadata?.pdf_producer) {
    evidence.push(`Container generated via: ${technicalMetadata.pdf_producer}`);
  }
  if (technicalMetadata?.pdf_creator) {
    evidence.push(`Authoring application: ${technicalMetadata.pdf_creator}`);
  }
  if (technicalMetadata?.c2pa?.detected) {
    evidence.push('Cryptographic C2PA provenance manifest present.');
  }

  return {
    anomalies,
    warnings,
    evidence,
    isConsistent: anomalies.length === 0,
    hasSevereAnomaly: anomalies.some(a => a.severity === 'HIGH' || a.severity === 'CRITICAL')
  };
}

/**
 * Parses PDF Date format: D:YYYYMMDDHHmmSSOHH'mm'
 */
function parsePdfDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/i);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = match[2] ? parseInt(match[2], 10) - 1 : 0;
    const day = match[3] ? parseInt(match[3], 10) : 1;
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const min = match[5] ? parseInt(match[5], 10) : 0;
    const sec = match[6] ? parseInt(match[6], 10) : 0;
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }
  const isoParsed = Date.parse(dateStr);
  if (!isNaN(isoParsed)) {
    return new Date(isoParsed);
  }
  return null;
}

/**
 * Parses generic date strings commonly found in contracts
 */
function parseGenericDate(str) {
  if (!str || typeof str !== 'string') return null;
  const clean = str.replace(/(st|nd|rd|th)/gi, '').trim();
  const parsed = Date.parse(clean);
  if (isNaN(parsed)) return null;
  return new Date(parsed);
}

module.exports = {
  verifyDocumentMetadata,
  parsePdfDate,
  parseGenericDate
};
