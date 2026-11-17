"""music.py — soundtrack van de promofilm, volledig gesynthetiseerd.

120 BPM, 4/4, een maat is precies 2 seconden, zodat secties op de scènewissels vallen.
Akkoorden: Bm9 – Gmaj9 – D(add9) – A(add9), steeds 8 seconden.
Onder de opening ligt een zacht netbrom van 50 Hz, de frequentie van het Nederlandse stroomnet.
De interfacegeluiden (klikken, typen, whooshes) komen uit events.json, dat render.mjs schrijft.

    python promo/music.py promo/build/events.json promo/build/muziek.wav
Vereist numpy en scipy.
"""
import json
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
DUR = 102.0
N = int(SR * DUR)
BAR = 2.0
rng = np.random.default_rng(20261117)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x, axis=-1)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x, axis=-1)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=-1)


def saw(f, n, phase0=0.0):
    """Zaagtand met polyBLEP tegen aliasing."""
    dt = f / SR
    ph = (phase0 + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt
    y[m] -= x * x + x + x + 1
    return y


def adsr(n, a, r, sus=1.0, d=0.0):
    t = tt(n)
    e = np.minimum(1.0, t / max(a, 1e-4))
    if d > 0:
        e = np.where(t > a, sus + (1 - sus) * np.exp(-(t - a) / d), e)
    rel = np.clip((t[-1] - t) / max(r, 1e-4), 0, 1)
    return e * rel


def place(bus, sig, t0, gain=1.0, pan=0.0):
    """Leg een mono- of stereosignaal op tijd t0 in een stereobus."""
    i = int(round(t0 * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414])
    j = min(N, i + sig.shape[1])
    if i < 0:
        sig, i = sig[:, -i:], 0
    bus[:, i:j] += gain * sig[:, : j - i]


def reverb_ir(sec=2.4, tone=5000):
    n = int(sec * SR)
    t = tt(n)
    env = np.exp(-t * 6.9 / sec)
    ir = rng.standard_normal((2, n)) * env
    ir = lp(ir, tone)
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def reverb(x, ir, wet):
    y = np.stack([fftconvolve(x[0], ir[0])[:N], fftconvolve(x[1], ir[1])[:N]])
    return y * wet


def delay(x, sec, fb, wet):
    d = int(sec * SR)
    y = np.zeros_like(x)
    tap = x.copy()
    g = wet
    for k in range(6):
        tap = np.roll(tap, d, axis=1)
        tap[:, :d] = 0
        tap = lp(tap, 4200, 1)
        y += g * (tap[::-1] if k % 2 == 0 else tap)   # pingpong
        g *= fb
    return y


# ---------- harmonie ----------
CHORDS = [  # (bas, padtonen)
    (35, [62, 66, 69, 73]),   # Bm9
    (31, [62, 66, 69, 71]),   # Gmaj9
    (38, [62, 64, 66, 69]),   # D(add9)
    (33, [64, 69, 71, 73]),   # A(add9)
]
FINAL = (38, [54, 62, 66, 69, 73, 76])   # Dmaj9 voor het slot


def chord_at(t):
    return CHORDS[int(t // BAR) % 4]


def section(t):
    if t < 8: return 'intro'
    if t < 14: return 'title'
    if t < 52: return 'groove'
    if t < 56: return 'break'
    if t < 92: return 'groove2'
    return 'outro'


# ---------- bussen ----------
pad_bus = np.zeros((2, N)); arp_bus = np.zeros((2, N)); bass_bus = np.zeros((2, N))
drum_bus = np.zeros((2, N)); fx_bus = np.zeros((2, N)); ui_bus = np.zeros((2, N)); bell_bus = np.zeros((2, N))

# ---------- pad ----------
for b in range(int(DUR // BAR)):
    t0 = b * BAR
    sec = section(t0)
    if sec == 'outro':
        continue
    _, notes = chord_at(t0)
    n = int((BAR + 0.9) * SR)
    cut = {'intro': 650 + 900 * t0 / 8, 'title': 1700, 'groove': 2100, 'break': 900, 'groove2': 2600}[sec]
    if sec == 'break':
        cut = 1400 - 300 * (t0 - 52) / 2
    lvl = {'intro': 0.5 + 0.5 * t0 / 8, 'title': 1.0, 'groove': 0.9, 'break': 1.0, 'groove2': 0.9}[sec]
    sig = np.zeros((2, n))
    for m in notes:
        for k, det in enumerate((-0.11, 0.0, 0.11)):
            v = saw(midi(m + det), n, rng.random())
            pan = (-0.7, 0.0, 0.7)[k]
            place_sig = np.stack([v * np.cos((pan + 1) * np.pi / 4), v * np.sin((pan + 1) * np.pi / 4)])
            sig += place_sig
    sig = lp(sig, cut, 2) * adsr(n, 0.45 if sec == 'intro' else 0.25, 0.9)
    place(pad_bus, sig, t0, 0.055 * lvl)

# slotakkoord, lang uitklinkend
n = int(10.5 * SR)
sig = np.zeros((2, n))
for m in FINAL[1]:
    for k, det in enumerate((-0.1, 0.0, 0.1)):
        v = saw(midi(m + det), n, rng.random())
        pan = (-0.6, 0.0, 0.6)[k]
        sig += np.stack([v * np.cos((pan + 1) * np.pi / 4), v * np.sin((pan + 1) * np.pi / 4)])
sig = lp(sig, 1500, 2) * adsr(n, 0.08, 4.0)
place(pad_bus, sig, 92.0, 0.05)

# ---------- netbrom 50 Hz in de opening ----------
n = int(8.1 * SR)
t = tt(n)
hum = np.sin(2 * np.pi * 50 * t) + 0.5 * np.sin(2 * np.pi * 100 * t) + 0.25 * np.sin(2 * np.pi * 150 * t) + 0.12 * np.sin(2 * np.pi * 250 * t)
hum *= np.minimum(1, t / 2.5) * np.clip((8.0 - t) / 0.08, 0, 1) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * t))
place(fx_bus, hum, 0.0, 0.06)

# ---------- arpeggio ----------
PAT = [0, 2, 1, 3, 2, 0, 3, 1]
for s16 in range(int(DUR / 0.125)):
    t0 = s16 * 0.125
    sec = section(t0)
    step = 1 if sec in ('groove', 'groove2', 'title') else 2
    if sec == 'outro' or s16 % step or t0 < 2.0:
        continue
    if sec == 'break' and t0 >= 55.5:
        continue
    _, notes = chord_at(t0)
    m = notes[PAT[(s16 // step) % 8]] + 12
    n = int(0.5 * SR)
    t = tt(n)
    f = midi(m)
    v = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t))
    v *= np.minimum(1, t / 0.003) * np.exp(-t / (0.16 if step == 1 else 0.3))
    acc = 1.0 if s16 % 4 == 0 else 0.7
    lvl = {'intro': 0.7 * min(1, (t0 - 2) / 4), 'title': 0.85, 'groove': 1.0, 'break': 0.8, 'groove2': 1.0}[sec]
    place(arp_bus, v, t0, 0.095 * acc * lvl, pan=0.35 * np.sin(s16 * 0.7))

# ---------- bas ----------
for e8 in range(int(DUR / 0.25)):
    t0 = e8 * 0.25
    sec = section(t0)
    if sec not in ('groove', 'groove2') or e8 % 2 == 0:
        continue
    root, _ = chord_at(t0)
    m = root + (12 if e8 % 8 == 7 else 0)
    n = int(0.24 * SR)
    t = tt(n)
    f = midi(m + 12)
    v = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    v = np.tanh(1.6 * v) * adsr(n, 0.004, 0.05)
    place(bass_bus, v, t0, 0.16)

# ---------- drums ----------
def kick():
    n = int(0.45 * SR); t = tt(n)
    f = 46 + 110 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-t / 0.26)
    v[: int(0.003 * SR)] += hp(rng.standard_normal(int(0.003 * SR)), 2000) * 0.4
    return np.tanh(1.4 * v)


def clap():
    n = int(0.35 * SR); t = tt(n)
    nz = bp(rng.standard_normal(n), 900, 3200)
    env = np.zeros(n)
    for k, o in enumerate((0, 0.011, 0.022)):
        i = int(o * SR)
        env[i:] += np.exp(-(t[: n - i]) / (0.008 if k < 2 else 0.11))
    return nz * env


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR); t = tt(n)
    return hp(rng.standard_normal(n), 7500) * np.exp(-t / (0.08 if open_ else 0.018))


K, C, HO, HC = kick(), clap(), hat(True), hat(False)
kick_times = []
for beat in range(int(DUR / 0.5)):
    t0 = beat * 0.5
    sec = section(t0)
    if sec in ('groove', 'groove2'):
        place(drum_bus, K, t0, 0.30); kick_times.append(t0)
        if beat % 2 == 1:
            place(drum_bus, C, t0, 0.10, pan=0.05)
        place(drum_bus, HO, t0 + 0.25, 0.04, pan=0.25)
        for s in (0.125, 0.375):
            place(drum_bus, HC, t0 + s, 0.035 if sec == 'groove' else 0.045, pan=-0.3)
    elif sec == 'title' and beat % 4 == 0 and t0 >= 10:
        place(drum_bus, K, t0, 0.2); kick_times.append(t0)
# rollen naar de groove toe
for t0, t1 in ((13.0, 14.0), (55.0, 56.0)):
    k = 0
    while True:
        tt0 = t0 + (t1 - t0) * (1 - (1 - k / 16) ** 1.0)
        if tt0 >= t1 - 0.01: break
        place(drum_bus, C, tt0, 0.03 + 0.08 * k / 16, pan=0.1)
        k += 1

# ---------- sidechain ----------
duck = np.ones(N)
tt_all = tt(N)
for k0 in kick_times:
    i = int(k0 * SR); j = min(N, i + int(0.4 * SR))
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.55 * np.exp(-(tt_all[i:j] - k0) / 0.11))
pad_bus *= duck; arp_bus *= 0.6 + 0.4 * duck; bass_bus *= duck

# ---------- bel-melodie in het tweede deel ----------
MEL = [(0.0, 78), (0.75, 81), (1.5, 83), (2.0, 86), (2.75, 83), (3.5, 81), (4.0, 78), (4.75, 76), (5.5, 74), (6.0, 76), (6.75, 73), (7.5, 76)]
for loop in range(int((92 - 56) / 8)):
    for o, m in MEL:
        t0 = 56 + loop * 8 + o
        if t0 >= 91.5: continue
        n = int(1.6 * SR); t = tt(n); f = midi(m)
        idx = 2.2 * np.exp(-t / 0.25)
        v = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 0.55) * np.minimum(1, t / 0.002)
        place(bell_bus, v, t0, 0.08, pan=0.2 * np.sin(o))
for o, m in ((0.0, 81), (0.6, 78), (1.2, 74), (2.4, 69)):     # slot
    n = int(3 * SR); t = tt(n); f = midi(m)
    v = np.sin(2 * np.pi * f * t + 1.8 * np.exp(-t / 0.3) * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 1.1) * np.minimum(1, t / 0.002)
    place(bell_bus, v, 93.0 + o, 0.08, pan=-0.2 + 0.15 * o)

# ---------- effecten ----------
def riser(sec, up=True):
    n = int(sec * SR); t = tt(n); p = t / sec
    nz = rng.standard_normal(n)
    bands = [lp(nz, 700), bp(nz, 1200, 3000), hp(nz, 5000)]
    w = [np.clip(1 - 2 * p, 0, 1), 1 - np.abs(2 * p - 1), np.clip(2 * p - 1, 0, 1)]
    v = sum(b * x for b, x in zip(bands, w))
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1400 * p ** 2) / SR) * 0.25
    v = (v + sweep) * (p ** 2.2)
    return v if up else v[::-1]


def whoosh():
    n = int(0.7 * SR); t = tt(n); p = t / 0.7
    nz = rng.standard_normal(n)
    v = bp(nz, 500, 4000) * np.sin(np.pi * p) ** 2
    pan = np.linspace(-0.8, 0.8, n)
    return np.stack([v * np.cos((pan + 1) * np.pi / 4), v * np.sin((pan + 1) * np.pi / 4)]) * 1.4


def impact():
    n = int(2.5 * SR); t = tt(n)
    f = 38 + 60 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    nz = lp(rng.standard_normal(n), 2500) * np.exp(-t / 0.35) * 0.5
    return np.tanh(1.3 * (boom + nz))


def blip(f, dec, noise=0.0):
    n = int(0.06 * SR); t = tt(n)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t / dec)
    if noise:
        v += hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004) * noise
    return v


place(fx_bus, riser(2.0), 6.0, 0.12)
place(fx_bus, riser(2.0), 12.0, 0.10)
place(fx_bus, riser(4.0), 52.0, 0.12)

events = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
for e in events:
    t0, kind = e['t'], e['type']
    if kind == 'hit':
        place(fx_bus, impact(), t0, 0.5)
        place(fx_bus, hp(rng.standard_normal(int(1.8 * SR)), 4000) * np.exp(-tt(int(1.8 * SR)) / 0.5), t0, 0.06)
    elif kind == 'whoosh':
        place(fx_bus, whoosh(), t0 - 0.25, 0.10)
    elif kind == 'click':
        place(ui_bus, blip(1900, 0.012, 0.5), t0, 0.16, pan=0.1)
    elif kind == 'key':
        place(ui_bus, blip(2600, 0.007, 0.8), t0, 0.11, pan=0.15)
    elif kind == 'tick':
        place(ui_bus, blip(1300, 0.010), t0, 0.10)

# ---------- mix ----------
ir = reverb_ir()
send = pad_bus * 0.35 + arp_bus * 0.8 + bell_bus * 0.9 + drum_bus * 0.08 + fx_bus * 0.4 + ui_bus * 0.25
dl = delay(arp_bus * 0.9 + bell_bus, 0.375, 0.42, 0.35)
mix = pad_bus + arp_bus + bass_bus + drum_bus + fx_bus + ui_bus + bell_bus + dl + reverb(send + dl * 0.5, ir, 0.55)
mix = hp(mix, 28)
fade = np.clip((DUR - 0.05 - tt_all) / 2.2, 0, 1) ** 1.5
fade *= np.clip(tt_all / 0.02, 0, 1)
mix *= fade
ref = np.percentile(np.abs(mix), 99.95)
print(f'voor de limiter: piek {np.abs(mix).max():.2f}, 99,95e percentiel {ref:.2f}')
mix = mix / ref
mix = np.where(np.abs(mix) < 0.8, mix, np.sign(mix) * (0.8 + 0.2 * np.tanh((np.abs(mix) - 0.8) / 0.2)))   # zachte limiter boven 0,8
mix /= np.abs(mix).max() / 0.89

out = sys.argv[2] if len(sys.argv) > 2 else 'muziek.wav'
pcm = (mix.T * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'geschreven: {out} ({DUR:.0f} s)')
