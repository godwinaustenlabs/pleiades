import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { loadConfig } from '../agents/accountant/config';

/**
 * Filing a generated PDF: version it, put it in R2, record what it said.
 *
 * Lifted out of `render.ts` when the ledger reports arrived so both go through
 * one implementation. Two copies of "work out the next version number" is two
 * chances for a regenerated document to overwrite one somebody has already
 * circulated, and the copy that got it wrong would be the one nobody tested.
 */

export interface FileRequest {
  /** `generated_documents.doc_type`. Also the leading part of the R2 key. */
  docType: string;
  /** Identifies the period (and, for a ledger report, the scope) within a type. */
  periodLabel: string;
  bytes: Uint8Array;
  actorUserId: string;
  /** Stored beside the document: where the numbers came from, and who asked. */
  basis: Record<string, unknown>;
}

export interface FiledDocument {
  docId: string;
  docType: string;
  periodLabel: string;
  version: number;
  r2Key: string;
  url: string;
  bytes: number;
}

/** Everything R2 and a URL will tolerate in a key segment. */
export function safeSegment(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'untitled'
  );
}

/**
 * Where a filed document lives.
 *
 * Under `finance-docs/reports/<journal|ledger>/` rather than beside the
 * statements, because `src/routes/assets.ts` resolves read permission by the
 * first matching prefix and those two directories need different grants: a
 * journal report is a transcript of `general_journals`, so reading one has to
 * require `finance/journals` and not merely `finance/docs`.
 */
export function reportKey(kind: 'journal' | 'ledger', docType: string, periodLabel: string, version: number) {
  return `finance-docs/reports/${kind}/${safeSegment(`${docType}_${periodLabel}`)}_v${version}.pdf`;
}

export function statementKey(docType: string, periodLabel: string, version: number) {
  return `finance-docs/statements/${docType}_${periodLabel}_v${version}.pdf`;
}

/** Company identity for the letterhead, from the operator's settings. */
export async function letterhead(env: Env) {
  const vars = await loadConfig(env);
  const get = (k: string) => vars.find((v) => v.key === k)?.value || null;
  return {
    // Falls back to a neutral label rather than inventing a legal name: a
    // statement headed with the wrong entity is worse than one headed plainly.
    organisation: get('company_legal_name') || 'The company',
    ntn: get('company_ntn'),
    currency: 'PKR',
    accountant: get('accountant_name'),
  };
}

/** The next version for a (doc_type, period_label) pair. */
export async function nextVersion(env: Env, docType: string, periodLabel: string): Promise<number> {
  const previous = await getDb(env)
    .select()
    .from(schema.generatedDocuments)
    .where(
      and(
        eq(schema.generatedDocuments.docType, docType),
        eq(schema.generatedDocuments.periodLabel, periodLabel),
      ),
    )
    .orderBy(desc(schema.generatedDocuments.version))
    .limit(1);
  return (previous[0]?.version ?? 0) + 1;
}

/**
 * Writes the PDF to R2 and records it.
 *
 * Written straight to the bucket from the Worker rather than posted through
 * `PUT /api/assets/upload/*`: that route exists for browser uploads and holds
 * the whole body in memory with a 25 MB ceiling. `finance-docs/` is already an
 * allowed upload prefix, so the download authorises with no new wiring, and
 * `application/pdf` is on the inline-safe list.
 *
 * Version rather than overwrite, always. A regenerated document sits beside the
 * one somebody may already have sent to an auditor.
 */
export async function fileDocument(
  env: Env,
  req: FileRequest,
  keyFor: (version: number) => string,
): Promise<FiledDocument | { error: string }> {
  if (!env.CRM_BUCKET) return { error: 'No document bucket is configured on this Worker.' };

  const version = await nextVersion(env, req.docType, req.periodLabel);
  const r2Key = keyFor(version);

  await env.CRM_BUCKET.put(r2Key, req.bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  const docId = generateId('gdoc');
  const url = `/api/assets/download/${encodeURIComponent(r2Key)}`;
  await getDb(env).insert(schema.generatedDocuments).values({
    id: docId,
    docType: req.docType,
    periodLabel: req.periodLabel,
    version,
    fileUrl: url,
    generatedBy: req.actorUserId,
    // What the numbers came from, kept with the document rather than in a log
    // that rotates: a report is only as good as the trail behind it.
    generationBasis: JSON.stringify(req.basis),
    createdAt: new Date(),
  });

  return { docId, docType: req.docType, periodLabel: req.periodLabel, version, r2Key, url, bytes: req.bytes.length };
}
