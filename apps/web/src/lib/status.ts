/**
 * Maps a free-text status value onto one of the semantic chip tones.
 *
 * The grid previously inlined this as a three-way ternary whose final branch
 * was `danger`, so every value it did not explicitly recognise rendered red —
 * "completed", "operational", "planning" and "draft" all read as failures.
 * Anything unknown is now `neutral`, and only the words that genuinely mean
 * trouble get the red treatment.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/* Checked in order. `danger` comes first so "inactive" is not swallowed by the
   "active" test in `success`, and so "not approved" cannot read as approved. */
const TONES: [StatusTone, string[]][] = [
	[
		'danger',
		[
			'inactive', 'cancelled', 'canceled', 'failed', 'failure', 'rejected', 'declined',
			'overdue', 'critical', 'blocked', 'terminated', 'expired', 'lost', 'error',
			'suspended', 'breach', 'down', 'unpaid', 'delinquent', 'void',
		],
	],
	[
		'success',
		[
			'active', 'paid', 'approved', 'completed', 'complete', 'operational', 'resolved',
			'closed', 'done', 'success', 'passed', 'live', 'signed', 'won', 'healthy',
			'verified', 'settled', 'fulfilled', 'compliant', 'confirmed',
		],
	],
	[
		'warning',
		[
			'pending', 'paused', 'on hold', 'on_hold', 'review', 'draft', 'degraded',
			'maintenance', 'partial', 'submitted', 'awaiting', 'processing', 'in progress',
			'in_progress', 'medium', 'high', 'warning', 'due', 'renewal',
		],
	],
	[
		'info',
		[
			'planning', 'planned', 'scheduled', 'new', 'open', 'upcoming', 'queued', 'todo',
			'to do', 'backlog', 'low', 'draft', 'proposed', 'prospect', 'assigned',
		],
	],
];

export function statusTone(value: unknown): StatusTone {
	const v = String(value ?? '').toLowerCase().trim();
	if (!v) return 'neutral';
	for (const [tone, words] of TONES) {
		if (words.some((w) => v.includes(w))) return tone;
	}
	return 'neutral';
}

/** The chip classes for a status value — pair with the `chip` base class. */
export function statusChipClass(value: unknown): string {
	return `chip chip-dot chip-${statusTone(value)}`;
}
