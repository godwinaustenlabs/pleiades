import { describe, it, expect, beforeAll } from 'vitest';
import { SELF } from 'cloudflare:test';
import { resetDatabase, forgedToken } from './helpers';
import { spliceDictation } from '../apps/web/src/lib/dictation';

/**
 * Voice dictation into personal notes.
 *
 * The transcription itself is Workers AI and is not called from the suite. What
 * is pinned here is everything around it: how spoken words are written into text
 * that is already there (the part a person sees go wrong), and that the route
 * refuses what it should before it ever reaches the model.
 */

describe('spliceDictation — writing spoken words into a note', () => {
  it('fills an empty note', () => {
    expect(spliceDictation('', 'Buy milk.', '')).toEqual({ value: 'Buy milk.', caret: 9 });
  });

  it('appends after a sentence with a space, keeping the capital', () => {
    const r = spliceDictation('First point.', 'Second point.', '');
    expect(r.value).toBe('First point. Second point.');
    expect(r.caret).toBe(r.value.length);
  });

  it('drops the full stop when the sentence carries on, and leaves the caret before what follows', () => {
    const r = spliceDictation('The meeting is ', 'on Thursday.', ' at noon.');
    expect(r.value).toBe('The meeting is on Thursday at noon.');
    expect(r.value.slice(0, r.caret)).toBe('The meeting is on Thursday');
  });

  it('keeps the full stop before a new sentence', () => {
    expect(spliceDictation('', 'Done.', ' Next item.').value).toBe('Done. Next item.');
  });

  it('adds the space a word needs on either side', () => {
    expect(spliceDictation('hello', 'there', 'world').value).toBe('hello there world');
  });

  it('keeps capitalisation as spoken, so names survive mid-sentence', () => {
    expect(spliceDictation('send it to ', 'Arham today.', '').value).toBe('send it to Arham today.');
  });

  it('does not add a space on a new line, or before punctuation that follows', () => {
    expect(spliceDictation('- milk\n', 'Eggs', '').value).toBe('- milk\nEggs');
    expect(spliceDictation('Call ', 'Arham', ', then Hashir.').value).toBe('Call Arham, then Hashir.');
  });

  it('leaves the text untouched and the caret where it was when nothing was said', () => {
    expect(spliceDictation('abc ', '  ', 'def')).toEqual({ value: 'abc def', caret: 4 });
  });
});

describe('POST /api/dashboard/notes/transcribe', () => {
  beforeAll(resetDatabase);

  async function post(body: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return SELF.fetch('https://test.local/api/dashboard/notes/transcribe', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('needs a session', async () => {
    expect((await post({ audio: 'AAAA' })).status).toBe(401);
  });

  it('refuses a request with no audio', async () => {
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    expect((await post({}, token)).status).toBe(400);
    expect((await post({ audio: 42 }, token)).status).toBe(400);
  });

  it('refuses a recording past the size cap before it reaches the model', async () => {
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    expect((await post({ audio: 'A'.repeat(4_000_001) }, token)).status).toBe(413);
  });
});
