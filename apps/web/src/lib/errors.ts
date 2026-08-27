/**
 * Narrows a caught value to a displayable message.
 *
 * `catch (e)` gives `unknown`, which is correct — a thrown value need not be an
 * Error. This centralises the narrowing so call sites don't need `e: any` just
 * to reach `.message`.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	if (err && typeof err === 'object' && 'message' in err) {
		const m = (err as { message: unknown }).message;
		if (typeof m === 'string') return m;
	}
	return fallback;
}
