"""Generate the local notification chime using only Python's standard library."""

import math
from pathlib import Path
import struct
import wave


SAMPLE_RATE = 44100
DURATION = 0.36


def tone(time, onset, duration, frequency, gain):
    age = time - onset
    if not 0 < age < duration:
        return 0.0
    attack = math.sin(min(age / 0.012, 1) * math.pi / 2) ** 2
    release = math.sin(min((duration - age) / 0.065, 1) * math.pi / 2) ** 2
    envelope = attack * release * math.exp(-age / 0.075)
    phase = 2 * math.pi * frequency * age
    # Mostly sine, with a quiet, quickly fading harmonic for a warm bright edge.
    voice = math.sin(phase) + 0.09 * math.exp(-age / 0.035) * math.sin(2 * phase)
    return gain * envelope * voice


samples = []
for index in range(round(SAMPLE_RATE * DURATION)):
    time = index / SAMPLE_RATE
    value = tone(time, 0.0, 0.23, 880.0, 0.23)
    value += tone(time, 0.105, 0.255, 1174.659, 0.19)
    samples.append(round(value * 32767))

destination = Path(__file__).resolve().parents[1] / "public/sounds/notification.wav"
destination.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(destination), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(SAMPLE_RATE)
    output.writeframes(struct.pack(f"<{len(samples)}h", *samples))

print(f"Generated {destination.name}: {DURATION:.2f}s, {destination.stat().st_size} bytes")
