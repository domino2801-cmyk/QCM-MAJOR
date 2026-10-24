import subprocess, pathlib, shutil
from playwright.sync_api import sync_playwright

FPS, DUR = 24, 90
root = pathlib.Path(__file__).parent
frames = root / "frames"
shutil.rmtree(frames, ignore_errors=True)
frames.mkdir()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto((root / "promo.html").as_uri())
    pg.evaluate("document.fonts.ready")
    for i in range(FPS * DUR):
        pg.evaluate(f"setTime({i / FPS})")
        pg.screenshot(path=str(frames / f"f{i:05d}.jpg"), type="jpeg", quality=92)
    b.close()

# Musique de l'application + un "bonne réponse" à l'apparition des thèmes et du CTA
dings = [29, 31, 33, 35, 37, 39, 81.5]
inputs = ["-framerate", str(FPS), "-i", str(frames / "f%05d.jpg"), "-i", str(root / "music.mp3")]
for _ in dings:
    inputs += ["-i", str(root / "ding.mp3")]
fc = "[1:a]volume=0.6,afade=t=in:d=2,afade=t=out:st=86:d=4[m];"
for k, t in enumerate(dings):
    fc += f"[{k + 2}:a]adelay={int(t * 1000)}|{int(t * 1000)},volume=0.8[d{k}];"
fc += "[m]" + "".join(f"[d{k}]" for k in range(len(dings))) + f"amix=inputs={len(dings) + 1}:normalize=0,atrim=0:{DUR}[a]"
subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", fc, "-map", "0:v", "-map", "[a]",
                "-t", str(DUR), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                "-c:a", "aac", "-b:a", "160k", str(root / "qcm-major-promo.mp4")], check=True)
shutil.rmtree(frames, ignore_errors=True)
