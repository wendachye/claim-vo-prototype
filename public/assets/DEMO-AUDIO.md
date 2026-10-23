# Synthetic demo voice notes

These recordings were generated locally with the macOS Samantha speech voice. They are fictional demonstration assets, not recordings of site workers or actual S.I.T. activity. The prototype does not transcribe uploaded recordings or call a speech recognition service.

| File | Duration | Script |
| --- | --- | --- |
| `demo-voice-clear.wav` | 6.22 s | Block A west wall cladding is fifty percent complete in total. This is a synthetic demo voice note. |
| `demo-voice-unclear.wav` | 7.90 s | Block A east wall. Another ten percent. Please check the total with the supervisor. This is a synthetic demo voice note. |

Both files are mono 22,050 Hz PCM WAV. They were generated using `say` to an AIFF file, then converted to PCM WAV using `afconvert`.

The clear example's initial simulated transcript deliberately says “west wail” so the reviewer can correct it to “west wall” with a reason. Its numerical total is 50%. The second example is unclear about cumulative completion, even though the spoken words are audible; a transcript correction cannot invent the worker's missing total. Use the existing separate clarification reply instead.

## Original S.I.T. showcase examples

Two additional synthetic scripts relate to source row D.5 (180 cantilever wall brackets). The source does not identify bracket work faces. BRACKET-A/B are explicitly simulated, unplaced 90-piece areas for demonstrating separate progress; no location is inferred from the source drawing.

| File | Duration | Script |
| --- | --- | --- |
| `demo-sit-voice-clear.wav` | 10.54 s | Cantilever brackets in area BRACKET-A. Work item W I zero one six is fifty percent complete in total. This is a synthetic S I T demo voice note. |
| `demo-sit-voice-unclear.wav` | 11.07 s | Cantilever brackets in bracket zone. Another ten percent. Please check the area and cumulative total with the supervisor. This is a synthetic S I T demo voice note. |

The clear initial simulated transcript deliberately uses “Work itam” for a correction-with-reason example. The shared “Bracket zone” alternate name and incremental ten percent in the second recording require a separate clarification reply. These use the same local Samantha generation and PCM conversion process above; they are never actual worker recordings or speech recognition output.
