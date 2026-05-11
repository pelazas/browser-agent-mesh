import { describe, expect, it } from 'vitest';
import {
  chunkBodyText,
  cleanupDocumentText,
  detectBodyEndIndex,
  detectBodyStartIndex,
  preparePdfDocument,
} from '@agents/worker/pdf-summary';

describe('pdf-summary helpers', () => {
  it('removes reader markers and citation-style front matter noise', () => {
    const cleaned = cleanupDocumentText([
      'Title: Example Source',
      'URL Source: https://example.com/source',
      'Published Time: 2026-05-11T09:30:00Z',
      'Markdown Content:',
      '> 1',
      '# Example Article',
      'Actual body paragraph.',
    ].join('\n'));

    expect(cleaned).toBe('# Example Article\nActual body paragraph.');
  });

  it('keeps legitimate label-value body lines that do not match explicit front matter', () => {
    const cleaned = cleanupDocumentText([
      '# Triage Notes',
      'Summary: Customer impact remains limited to delayed notifications.',
      'Next step: Validate queue drain after the rollback completes.',
      'Revision 2.4 keeps the failover guidance current.',
      'Owner: Operations should confirm the final rollback window.',
    ].join('\n'));

    expect(cleaned).toContain('Summary: Customer impact remains limited to delayed notifications.');
    expect(cleaned).toContain('Next step: Validate queue drain after the rollback completes.');
    expect(cleaned).toContain('Revision 2.4 keeps the failover guidance current.');
    expect(cleaned).toContain('Owner: Operations should confirm the final rollback window.');
  });

  it('keeps quoted body lines that are not citation markers', () => {
    const cleaned = cleanupDocumentText([
      '# Incident Notes',
      '> Important context for responders.',
      'Actual body paragraph.',
    ].join('\n'));

    expect(cleaned).toContain('> Important context for responders.');
    expect(cleaned).toContain('Actual body paragraph.');
  });

  it('detects body start after PDF front matter and table-of-contents noise', () => {
    const paragraphs = [
      '# Incident Response Manual',
      'Confidential internal draft for training distribution only.',
      'Table of Contents\n1. Escalation model\n2. Severity rubric\n3. Recovery checkpoints',
      'This manual explains how service owners classify incidents, coordinate cross-team escalation, and restore customer-facing systems during business-critical outages.',
      'It also defines who makes severity decisions, which communications channels are required, and how teams confirm recovery before closing an event.',
    ];

    expect(detectBodyStartIndex(paragraphs)).toBe(3);
  });

  it('detects the end of the body before appendix-style trailing sections', () => {
    const paragraphs = [
      '# Procurement Playbook',
      'This playbook explains how procurement teams evaluate vendor risk, negotiate renewal terms, and document cost-saving decisions before contracts are approved.',
      'It highlights the checkpoints that matter for legal review, security validation, and executive sign-off on larger spend commitments.',
      'Appendix A\nTemplate fields and review checklists.',
      'References\n[1] Internal procurement glossary',
    ];

    expect(detectBodyEndIndex(paragraphs, 1)).toBe(2);
  });

  it('detects the end of the body before multi-paragraph appendix tails', () => {
    const paragraphs = [
      '# Operating Guide',
      'This guide explains how operators review alerts, escalate failures, and confirm service recovery during customer-impacting incidents.',
      'Teams use it to keep ownership clear, maintain timelines, and close incidents with the right communications in place.',
      'Appendix A',
      'Template fields and review checklists.',
      'Reference links for auditors.',
    ];

    expect(detectBodyEndIndex(paragraphs, 1)).toBe(2);
  });

  it('detects markdown heading forms for appendix and references', () => {
    const paragraphs = [
      '# Operating Guide',
      'This guide explains how operators review alerts, escalate failures, and confirm service recovery during customer-impacting incidents.',
      'Teams use it to keep ownership clear, maintain timelines, and close incidents with the right communications in place.',
      '# Appendix A',
      'Template fields and review checklists.',
      '## References',
      '[1] Internal glossary',
    ];

    expect(detectBodyEndIndex(paragraphs, 1)).toBe(2);
  });

  it('chunks body text by paragraph without exceeding the requested size', () => {
    const chunks = chunkBodyText([
      'Paragraph one has enough words to stand on its own.',
      'Paragraph two also carries enough detail to deserve its own chunk.',
      'Paragraph three finishes the sample document body cleanly.',
    ].join('\n\n'), 90);

    expect(chunks).toEqual([
      'Paragraph one has enough words to stand on its own.',
      'Paragraph two also carries enough detail to deserve its own chunk.',
      'Paragraph three finishes the sample document body cleanly.',
    ]);
  });

  it('prepares a PDF document with cleaned body text and chunks', () => {
    const prepared = preparePdfDocument([
      '# Procurement Playbook',
      '',
      'Prepared for vendor onboarding workshops.',
      '',
      'Revision 7.2',
      '',
      'Page 1 of 18',
      '',
      'Document Control',
      'Owner: Operations',
      '',
      'Approval Log',
      'Finance, Legal, Security',
      '',
      'This playbook explains how procurement teams evaluate vendor risk, negotiate renewal terms, and document cost-saving decisions before contracts are approved.',
      '',
      'It highlights the checkpoints that matter for legal review, security validation, and executive sign-off on larger spend commitments.',
      '',
      'Appendix A',
      'Template fields and review checklists.',
    ].join('\n'));

    expect(prepared.title).toBe('Procurement Playbook');
    expect(prepared.cleanedText).not.toContain('Page 1 of 18');
    expect(prepared.bodyText).toContain('vendor risk');
    expect(prepared.bodyText).toContain('security validation');
    expect(prepared.bodyText).not.toContain('Prepared for vendor onboarding workshops');
    expect(prepared.bodyText).not.toContain('Appendix A');
    expect(prepared.chunks).toEqual([
      prepared.bodyText,
    ]);
  });

  it('does not leak the markdown heading title into body text', () => {
    const prepared = preparePdfDocument([
      '# Operating Guide',
      '',
      'This guide explains how operators review alerts, escalate failures, and confirm service recovery during customer-impacting incidents.',
    ].join('\n'));

    expect(prepared.title).toBe('Operating Guide');
    expect(prepared.bodyText).toBe('This guide explains how operators review alerts, escalate failures, and confirm service recovery during customer-impacting incidents.');
    expect(prepared.bodyText).not.toContain('# Operating Guide');
  });

  it('does not treat the first body heading as the document title when front matter comes first', () => {
    const prepared = preparePdfDocument([
      'Prepared for vendor onboarding workshops.',
      '',
      'Document Control',
      '',
      '# Overview',
      '',
      'This section explains how teams review vendors, assess risk, and complete approvals.',
    ].join('\n'));

    expect(prepared.title).toBe('Prepared for vendor onboarding workshops.');
    expect(prepared.bodyText).toContain('# Overview');
    expect(prepared.bodyText).toContain('review vendors, assess risk, and complete approvals');
  });

  it('keeps the first real paragraph for heading-less documents', () => {
    const prepared = preparePdfDocument([
      'This guide explains how support teams triage incidents and coordinate urgent escalation across services.',
      '',
      'It also outlines who approves status updates and how teams confirm recovery before closing an issue.',
    ].join('\n'));

    expect(prepared.title).toBe('This guide explains how support teams triage incidents and coordinate urgent escalation across services.');
    expect(prepared.bodyText).toContain('triage incidents');
    expect(prepared.bodyText).toContain('confirm recovery');
  });

  it('detects short valid body content immediately after a title', () => {
    const paragraphs = [
      '# Escalation Notes',
      'Teams escalate incidents quickly.',
      'Leads approve customer updates promptly.',
    ];

    expect(detectBodyStartIndex(paragraphs)).toBe(1);
  });

  it('does not fall back to front matter when titled documents have no body paragraph', () => {
    const prepared = preparePdfDocument([
      '# Incident Response Manual',
      '',
      'Confidential internal draft for training distribution only.',
      '',
      'Table of Contents',
      '1. Escalation model',
      '2. Severity rubric',
    ].join('\n'));

    expect(prepared.title).toBe('Incident Response Manual');
    expect(prepared.bodyText).toBe('');
    expect(prepared.chunks).toEqual([]);
  });

  it('returns an empty body for appendix-only documents', () => {
    const prepared = preparePdfDocument([
      '# Appendix Packet',
      '',
      '# Appendix A',
      '',
      'Template fields and review checklists.',
      '',
      '## References',
      '',
      '[1] Internal glossary',
    ].join('\n'));

    expect(prepared.title).toBe('Appendix Packet');
    expect(prepared.bodyText).toBe('');
    expect(prepared.chunks).toEqual([]);
  });

  it('returns an empty body for heading-less front-matter-only documents', () => {
    const prepared = preparePdfDocument([
      'Prepared for vendor onboarding workshops.',
      '',
      'Document Control',
      'Owner: Operations',
      '',
      'Approval Log',
      'Finance, Legal, Security',
    ].join('\n'));

    expect(prepared.bodyText).toBe('');
    expect(prepared.chunks).toEqual([]);
  });

  it('keeps bullet lists, checklists, and colon-ended intros as body content', () => {
    const prepared = preparePdfDocument([
      '# Recovery Checklist',
      '',
      'Teams should complete the following steps:',
      '',
      '- Confirm the incident commander is assigned.',
      '- Verify the customer update has been posted.',
      '- Capture recovery evidence for the timeline.',
      '',
      '[ ] Close the status page incident once recovery is verified.',
    ].join('\n'));

    expect(prepared.bodyText).toContain('Teams should complete the following steps:');
    expect(prepared.bodyText).toContain('- Confirm the incident commander is assigned.');
    expect(prepared.bodyText).toContain('[ ] Close the status page incident once recovery is verified.');
  });

  it('keeps numbered procedure lists as body content', () => {
    const prepared = preparePdfDocument([
      '# Runbook',
      '',
      '1. Confirm the incident commander',
      '2. Notify stakeholders',
      '3. Capture timeline evidence',
    ].join('\n'));

    expect(prepared.title).toBe('Runbook');
    expect(prepared.bodyText).toContain('1. Confirm the incident commander');
    expect(prepared.bodyText).toContain('2. Notify stakeholders');
    expect(prepared.bodyText).toContain('3. Capture timeline evidence');
  });

  it('keeps compact numbered procedure paragraphs as body content', () => {
    const prepared = preparePdfDocument([
      '# Runbook',
      '',
      '1. Open panel 2. Click save 3. Restart app',
    ].join('\n'));

    expect(prepared.title).toBe('Runbook');
    expect(prepared.bodyText).toBe('1. Open panel 2. Click save 3. Restart app');
  });
});
