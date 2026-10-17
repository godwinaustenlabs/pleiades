# 0010 — Note dictation uses Whisper turbo without a prompt

**Status:** Accepted

**Decision.** `@cf/openai/whisper-large-v3-turbo` with `vad_filter: true` and no
`initial_prompt`. Live preview re-sends the recording at a growing gap; the browser
does the base64. Deepgram Nova-3 was faster but about ten times the price per audio
minute on a shared free allowance.

**Consequences.** Measured, not guessed: with the note as `initial_prompt`, Whisper
returned the prompt's first word repeated for audio it transcribed correctly bare;
without `vad_filter`, silence became "Thank you.". Do not add either back without
re-measuring. Transcription is rate-limited per user (0008).
