"""Synthesises TrackMate's original SOS siren (no samples, no recordings).

Pattern per 2.4 s loop: a rising sweep 650→1350 Hz with a fast 9 Hz warble, then
a falling sweep back, with a little second harmonic for presence. Phase is kept
continuous and the loop starts/ends at the same frequency so it repeats cleanly.
Run: python3 apps/mobile/scripts/make-siren.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
LOOP_S = 2.4
OUT = Path(__file__).resolve().parent.parent / "modules/signalmesh-nearby/android/src/main/res/raw/sos_siren.wav"


def freq(t: float) -> float:
    half = LOOP_S / 2
    x = t / half if t < half else (LOOP_S - t) / half  # 0→1→0
    base = 650 + 700 * (0.5 - 0.5 * math.cos(math.pi * x))  # smooth sweep
    return base * (1 + 0.035 * math.sin(2 * math.pi * 9 * t))  # warble


def main():
    n = int(RATE * LOOP_S)
    phase, frames = 0.0, bytearray()
    for i in range(n):
        t = i / RATE
        phase += 2 * math.pi * freq(t) / RATE
        s = 0.78 * math.sin(phase) + 0.16 * math.sin(2 * phase)
        frames += struct.pack("<h", int(max(-1, min(1, s)) * 32767 * 0.9))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {LOOP_S}s @ {RATE} Hz)")


if __name__ == "__main__":
    main()
