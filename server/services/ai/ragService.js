/**
 * Secondary RAG Knowledge Assistance Service for NotaryChain
 * 
 * Provides domain-specific legal, compliance, and procedure explanations.
 * ADVISORY ONLY: Answers "What does this mean under regulations?"
 * NEVER decides: "This identity is legally verified." (Authoritative security engine handles that)
 */

const KNOWLEDGE_BASE = [
  {
    topic: 'trust_score',
    keywords: ['trust score', 'score', 'points', 'deduction', 'factors', 'calculation'],
    title: 'NotaryChain Deterministic Trust Score Architecture',
    content: `The Trust Score is a deterministic 0-100 metric calculated by NotaryChain's primary security rules:
- Document Integrity (25 pts): Validates cryptographic SHA-256 hash match against tamper attempts.
- Identity & Signatory Verification (20 pts): Verifies contracting parties and biometrics.
- AI Risk Analysis (20 pts): Analyzes contract clauses, unilateral liability, and effective date presence.
- Blockchain Proof (20 pts): Confirms irreversible timestamp proof anchored to the Polygon Amoy blockchain.
- Verification Status (15 pts): Authoritative notary approval and audit confirmation.
AI models provide advisory explanations of deductions but cannot alter or recalculate the numerical score.`
  },
  {
    topic: 'it_act_2000',
    keywords: ['it act', 'india', 'legal validity', 'admissibility', 'section 65b', 'electronic signature'],
    title: 'Indian Information Technology Act, 2000 Compliance',
    content: `Under Section 4 and Section 5 of the Information Technology Act, 2000 (India), electronic records and digital signatures carry legal recognition equivalent to written documents.
- Section 65B of the Indian Evidence Act recognizes computer-generated output when cryptographic hashes and chain of custody are preserved.
- NotaryChain anchors document SHA-256 hashes to the Polygon blockchain, generating a tamper-evident audit record suitable for evidentiary presentation.`
  },
  {
    topic: 'eidas_esign',
    keywords: ['eidas', 'esign', 'ueta', 'united states', 'europe', 'international'],
    title: 'US ESIGN Act & EU eIDAS International Standards',
    content: `Under the US Electronic Signatures in Global and National Commerce (ESIGN) Act and Uniform Electronic Transactions Act (UETA), electronic records and signatures are legally binding.
Under EU Regulation (EU) No 910/2014 (eIDAS), qualified electronic timestamps provide legal presumption of the accuracy of date and time indicated and document integrity. NotaryChain provides tamper-evident timestamping with blockchain proofs.`
  },
  {
    topic: 'unilateral_liability',
    keywords: ['unlimited liability', 'indemnity', 'indemnification', 'uncapped', 'liability'],
    title: 'Uncapped Liability & Indemnification Risk Guideline',
    content: `Clauses containing uncapped or unilateral indemnification expose organizations to open-ended financial risk. Standard commercial contracts typically cap aggregate liability to fees paid within the preceding 12 months or a specified agreed limit. When NotaryChain flags unilateral liability, human legal counsel review is recommended.`
  },
  {
    topic: 'blockchain_anchoring',
    keywords: ['blockchain', 'polygon', 'amoy', 'tamper', 'hash', 'sha256'],
    title: 'Cryptographic Hashing & Polygon Blockchain Notarization',
    content: `NotaryChain computes the unique 256-bit SHA-256 cryptographic digest of uploaded documents. Even a 1-character modification completely alters this fingerprint (avalanche effect). The hash is permanently committed to the NotaryChain smart contract on Polygon Amoy, providing public mathematical proof that the document existed in that exact state.`
  }
];

class RAGService {
  /**
   * Search knowledge base for relevant legal/compliance context
   */
  search(query = '', category = '') {
    const q = (query || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    const matches = KNOWLEDGE_BASE.filter(item => {
      if (item.keywords.some(k => q.includes(k) || cat.includes(k))) return true;
      return false;
    });

    if (matches.length > 0) {
      return matches.slice(0, 2);
    }

    // Default to Trust Score & Blockchain overview
    return [KNOWLEDGE_BASE[0], KNOWLEDGE_BASE[4]];
  }

  /**
   * Format knowledge context string for AI prompt augmentation
   */
  getAugmentedContext(query = '', category = '') {
    const results = this.search(query, category);
    return results.map(r => `[COMPLIANCE KNOWLEDGE - ${r.title}]:\n${r.content}`).join('\n\n');
  }
}

module.exports = new RAGService();
