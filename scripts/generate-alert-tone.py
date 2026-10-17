"""Original Cartlyft sonic cue: a short bright five-note motif, no sampled audio."""
import math, struct, wave
from pathlib import Path
rate = 22050
notes = [(0, 659.25, .26), (.30, 880, .26), (.60, 987.77, .30), (.96, 783.99, .26), (1.27, 1046.5, .52)]
samples = []
for i in range(int(rate * 2.5)):
    t = i / rate
    value = 0
    for start, frequency, duration in notes:
        x = t - start
        if 0 <= x < duration:
            envelope = min(1, x / .012) * min(1, (duration-x) / .08) * math.exp(-1.4*x)
            value += envelope * (math.sin(2*math.pi*frequency*x) + .32*math.sin(4*math.pi*frequency*x) + .12*math.sin(6*math.pi*frequency*x))
    samples.append(value)
peak = max(abs(x) for x in samples)
path = Path(__file__).resolve().parents[1] / 'android/app/src/main/res/raw/cartlyft_attention.wav'
with wave.open(str(path), 'wb') as output:
    output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
    output.writeframes(b''.join(struct.pack('<h', round(x/peak*29000)) for x in samples))
print(path)
