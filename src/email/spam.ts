import { ParsedMessage } from './mime';

/**
 * Spam scoring, and the weakest part of this subsystem.
 *
 * Cloudflare Email Routing does phishing detection and no spam filtering, and it
 * stores nothing — so taking the apex MX means this file is what stands between
 * the staff and their junk. It is heuristics. It is not close to what a mailbox
 * provider gives you, and it should be treated as a first pass that will need
 * iterating against real mail rather than as a solved problem.
 *
 * Two decisions follow from that honesty:
 *
 *  1. **Nothing is ever rejected or deleted.** A verdict files a message in the
 *     `spam` folder, where a person can find it. A false positive on a client's
 *     reply is a lost deal; a false negative is an annoyance. The asymmetry is not
 *     close, so the thresholds are deliberately reluctant.
 *  2. **The DMARC verdict does most of the work**, because it is the only signal
 *     here that is not a guess — it was computed by a receiving MTA against DNS
 *     the sender controls. A `fail` from a domain publishing `p=reject` is
 *     near-certain forgery. Everything else nudges.
 */

export type SpamVerdict = { score: number; verdict: 'ham' | 'spam' | 'unknown' };

/** Above this, a message is filed as spam. Deliberately high — see decision 1. */
const SPAM_THRESHOLD = 5;

const SUSPICIOUS_PHRASES = [
  'verify your account', 'confirm your password', 'click here immediately',
  'you have won', 'wire transfer', 'cryptocurrency investment',
  'act now', 'limited time offer', 'unclaimed funds', 'bitcoin',
];

export function scoreMessage(
  message: ParsedMessage,
  auth: { spf?: string; dkim?: string; dmarc?: string },
  ourDomains: string[],
): SpamVerdict {
  let score = 0;
  const fromDomain = message.from.email.slice(message.from.email.lastIndexOf('@') + 1).toLowerCase();

  // Authentication. A DMARC fail is the strongest signal available.
  if (auth.dmarc === 'fail') score += 5;
  else if (auth.dmarc === 'pass') score -= 2;
  if (auth.spf === 'fail') score += 2;
  if (auth.dkim === 'fail') score += 1;

  /**
   * Somebody claiming to be us, from outside.
   *
   * This is the case worth catching above all others: an internal-looking sender
   * is what makes an invoice-redirection or a "the CEO needs a transfer" message
   * work. If the From is on one of our own domains and DMARC did not pass, it is
   * a forgery — our own DMARC record is published precisely so that a receiver can
   * tell, and we are the receiver here.
   */
  if (ourDomains.some((d) => fromDomain === d || fromDomain.endsWith(`.${d}`)) && auth.dmarc !== 'pass') {
    score += 6;
  }

  const haystack = `${message.subject}\n${message.text}`.toLowerCase();
  for (const phrase of SUSPICIOUS_PHRASES) {
    if (haystack.includes(phrase)) score += 1;
  }

  // An HTML-only message with no text part is a marketing-tool signature. Mild:
  // plenty of legitimate senders do it too.
  if (message.html && (!message.text || message.text.trim().length < 20)) score += 1;

  // ALL-CAPS SUBJECTS, once they are long enough for it to be a choice.
  if (message.subject.length > 12 && message.subject === message.subject.toUpperCase()) score += 1;

  return {
    score,
    verdict: score >= SPAM_THRESHOLD ? 'spam' : auth.dmarc === 'pass' ? 'ham' : 'unknown',
  };
}
