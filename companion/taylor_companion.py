"""
Taylor companion for your laptop (Windows / macOS).

Say "Taylor, ..." any time (no app open) and Taylor answers out loud.
She can also open apps: "Taylor, open Outlook and summarise my unread emails."

Setup (once):
  1. Install Python 3.11+ from python.org (tick "Add Python to PATH").
  2. In this folder:  pip install -r requirements.txt
  3. Download the small English speech model (about 40 MB):
       https://alphacephei.com/vosk/models  ->  vosk-model-small-en-us-0.15.zip
     and unzip it here so you have a folder called  model/
  4. In Taylor: Settings -> Devices -> Add laptop. Copy the key.
  5. Copy config.example.ini to config.ini and paste the key.
  6. Run:  python taylor_companion.py
     (To start with Windows: Win+R -> shell:startup -> add a shortcut to
      "pythonw taylor_companion.py" in this folder.)
"""

from __future__ import annotations

import configparser
import io
import json
import os
import platform
import queue
import subprocess
import sys
import time
import wave
import webbrowser
from pathlib import Path

import numpy as np
import requests
import sounddevice as sd
from vosk import KaldiRecognizer, Model, SetLogLevel

HERE = Path(__file__).resolve().parent
RATE = 16000
BLOCK = 4000  # 0.25 s

# ---------------------------------------------------------------- config
cfg = configparser.ConfigParser()
cfg.read(HERE / "config.ini")
URL = cfg.get("taylor", "url", fallback="https://taylor.capvtal.com").rstrip("/")
KEY = cfg.get("taylor", "key", fallback=os.environ.get("TAYLOR_KEY", ""))
SILENCE_SECONDS = cfg.getfloat("taylor", "silence_seconds", fallback=1.1)
MAX_SECONDS = cfg.getfloat("taylor", "max_seconds", fallback=15)
if not KEY.startswith("tdv_"):
    sys.exit("Add your device key to config.ini (Taylor -> Settings -> Devices -> Add laptop).")
HEADERS = {"Authorization": f"Bearer {KEY}"}

# ---------------------------------------------------------------- audio out
try:
    import pygame

    pygame.mixer.init()
except Exception:  # pragma: no cover
    pygame = None


def play_mp3(data: bytes) -> None:
    if not pygame:
        return
    pygame.mixer.music.load(io.BytesIO(data))
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        time.sleep(0.05)


def chime() -> None:
    t = np.linspace(0, 0.09, int(RATE * 0.09), False)
    tone = np.concatenate([np.sin(880 * 2 * np.pi * t), np.sin(1320 * 2 * np.pi * t)]) * 0.15
    sd.play(tone.astype(np.float32), RATE)
    sd.wait()


def speak(reply: dict) -> None:
    url = reply.get("audio_url")
    if url:
        try:
            r = requests.get(url, timeout=60)
            if r.status_code == 200 and r.content:
                play_mp3(r.content)
                return
        except requests.RequestException:
            pass
    try:  # fallback: the computer's own voice
        import pyttsx3

        e = pyttsx3.init()
        e.say(reply.get("spoken") or reply.get("reply", ""))
        e.runAndWait()
    except Exception:
        print("Taylor:", reply.get("reply"))


# ---------------------------------------------------------------- open apps
WIN_OPEN = {
    "outlook": "outlook", "calendar": "outlookcal:", "word": "winword", "excel": "excel", "powerpoint": "powerpnt",
    "teams": "msteams:", "chrome": "chrome", "edge": "msedge", "spotify": "spotify:", "whatsapp": "whatsapp:",
    "files": "explorer", "settings": "ms-settings:", "vscode": "code", "notes": "onenote:", "power bi": "pbidesktop",
}
WEB_OPEN = {
    "gmail": "https://mail.google.com", "youtube": "https://youtube.com", "instagram": "https://instagram.com",
    "facebook": "https://facebook.com", "tiktok": "https://tiktok.com", "linkedin": "https://linkedin.com",
    "maps": "https://maps.google.com", "capvtal.com": "https://www.capvtal.com", "taylor": URL,
}
MAC_APPS = {"outlook": "Microsoft Outlook", "calendar": "Calendar", "word": "Microsoft Word", "excel": "Microsoft Excel",
            "powerpoint": "Microsoft PowerPoint", "teams": "Microsoft Teams", "chrome": "Google Chrome", "edge": "Microsoft Edge",
            "spotify": "Spotify", "whatsapp": "WhatsApp", "files": "Finder", "settings": "System Settings", "vscode": "Visual Studio Code",
            "notes": "Notes"}


def open_app(app: str) -> None:
    if not app:
        return
    try:
        if app in WEB_OPEN:
            webbrowser.open(WEB_OPEN[app])
        elif platform.system() == "Windows":
            target = WIN_OPEN.get(app, app)
            os.startfile(target) if ":" in target else subprocess.Popen(["cmd", "/c", "start", "", target], shell=False)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", "-a", MAC_APPS.get(app, app)])
        print(f"[opened {app}]")
    except Exception as e:  # pragma: no cover
        print(f"Couldn't open {app}: {e}")


# ---------------------------------------------------------------- talk to Taylor
def transcribe(pcm: bytes) -> str:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    r = requests.post(f"{URL}/api/device/transcribe", data=buf.getvalue(), headers={**HEADERS, "Content-Type": "audio/wav"}, timeout=60)
    r.raise_for_status()
    return r.json().get("text", "")


def ask(text: str) -> dict:
    r = requests.post(f"{URL}/api/device/ask", json={"text": text}, headers=HEADERS, timeout=90)
    return r.json()


# ---------------------------------------------------------------- listening loop
def main() -> None:
    SetLogLevel(-1)
    if not (HERE / "model").exists():
        sys.exit("Speech model missing: unzip vosk-model-small-en-us-0.15 into a folder called 'model' next to this file.")
    model = Model(str(HERE / "model"))
    wake = KaldiRecognizer(model, RATE, json.dumps(["taylor", "tailor", "hey taylor", "okay taylor", "[unk]"]))
    q: "queue.Queue[bytes]" = queue.Queue()

    def cb(indata, frames, t, status):  # noqa: ARG001
        q.put(bytes(indata))

    print("Taylor is listening. Say “Taylor, …”  (Ctrl+C to quit)")
    follow_up_until = 0.0
    with sd.RawInputStream(samplerate=RATE, blocksize=BLOCK, dtype="int16", channels=1, callback=cb):
        while True:
            data = q.get()
            woke = False
            if time.time() < follow_up_until:
                level = np.abs(np.frombuffer(data, np.int16)).mean()
                woke = level > 900  # you started talking during the follow-up window
            else:
                if wake.AcceptWaveform(data):
                    woke = "taylor" in json.loads(wake.Result()).get("text", "")
                else:
                    woke = "taylor" in json.loads(wake.PartialResult()).get("partial", "")
            if not woke:
                continue

            wake.Reset()
            follow_up_until = 0.0
            chime()
            # Record the command until you pause.
            frames, silent, started = [data], 0.0, time.time()
            while time.time() - started < MAX_SECONDS:
                chunk = q.get()
                frames.append(chunk)
                level = np.abs(np.frombuffer(chunk, np.int16)).mean()
                silent = silent + BLOCK / RATE if level < 500 else 0.0
                if silent >= SILENCE_SECONDS and time.time() - started > 1.2:
                    break
            try:
                text = transcribe(b"".join(frames)).strip()
                text = text.lstrip(",. ")
                for w in ("hey taylor", "okay taylor", "taylor", "tailor"):
                    if text.lower().startswith(w):
                        text = text[len(w):].lstrip(",.!? ")
                        break
                if not text:
                    continue
                print("You:", text)
                reply = ask(text)
                print("Taylor:", reply.get("reply"))
                open_app(reply.get("open_app", ""))
                speak(reply)
                follow_up_until = time.time() + 6  # answer without saying "Taylor" again
            except Exception as e:  # pragma: no cover
                print("Error:", e)
            with q.mutex:
                q.queue.clear()  # ignore anything captured while Taylor was talking


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBye.")
