import subprocess, pathlib, shutil
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

FPS, DUR = 24, 120
root = pathlib.Path(__file__).parent
screenshots = root.parent / "docs" / "screenshots"
frames = root / "frames"
shutil.rmtree(frames, ignore_errors=True)
frames.mkdir()

def make_gallery_slides():
    image_paths = sorted(path for path in screenshots.iterdir()
                         if path.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not image_paths:
        raise FileNotFoundError(f"No screenshots found in {screenshots}")

    gallery_dir = frames / "gallery"
    gallery_dir.mkdir()
    regular_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 18)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 30)
    caption_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 16)
    slides = []

    for start in range(0, len(image_paths), 3):
        group = image_paths[start:start + 3]
        canvas = Image.new("RGB", (1280, 720), (7, 12, 15))
        draw = ImageDraw.Draw(canvas)
        draw.text((42, 34), "QCM-MAJOR  /  APERCU DE L'APPLICATION",
                  font=title_font, fill=(246, 211, 101))
        draw.text((965, 43), f"{start + 1:02d} - {start + len(group):02d} / {len(image_paths)}",
                  font=regular_font, fill=(210, 217, 200))

        for offset, path in enumerate(group):
            x = 28 + offset * 410
            draw.rounded_rectangle((x, 94, x + 394, 688), radius=18,
                                   fill=(14, 21, 25), outline=(146, 119, 54), width=2)
            with Image.open(path) as original:
                shot = original.convert("RGB")
                if path.name == "accueil-campagne-compte-connecte.jpg":
                    redact_region(shot, (70, 225, 1010, 305), "profil anonymise", caption_font)
                elif path.name == "inscription-compte-candidat.jpg":
                    redact_region(shot, (150, 1060, 720, 1140), "adresse masquee", caption_font)
                elif path.name in {"connexion-classement-top3.jpg", "connexion-classement-mobile.jpg"}:
                    redact_region(shot, (150, 1375, 720, 1455), "adresse masquee", caption_font)
                shot.thumbnail((360, 530), Image.Resampling.LANCZOS)
                image_x = x + (394 - shot.width) // 2
                image_y = 106 + (530 - shot.height) // 2
                canvas.paste(shot, (image_x, image_y))
            label = path.stem.replace("-", " ")
            while draw.textbbox((0, 0), label, font=caption_font)[2] > 366 and " " in label:
                label = label.rsplit(" ", 1)[0]
            draw.text((x + 14, 650), label.upper(), font=caption_font,
                      fill=(230, 229, 214))

        slide_path = gallery_dir / f"slide-{start // 3 + 1:02d}.jpg"
        canvas.save(slide_path, quality=92)
        slides.append(slide_path)
    return slides

def redact_region(image, box, label, font):
    x1, y1, x2, y2 = box
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(box, radius=8, fill=(4, 7, 9))
    draw.text((x1 + 12, y1 + 14), label, font=font, fill=(151, 160, 145))

gallery_slides = make_gallery_slides()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto((root / "promo.html").as_uri())
    pg.evaluate("document.fonts.ready")
    pg.evaluate("(slides) => setGallerySlides(slides)",
                [path.resolve().as_uri() for path in gallery_slides])
    for i in range(FPS * DUR):
        pg.evaluate(f"setTime({i / FPS})")
        pg.screenshot(path=str(frames / f"f{i:05d}.jpg"), type="jpeg", quality=92)
    b.close()

# Musique de l'application + un "bonne réponse" à l'apparition des thèmes et du CTA
dings = [29, 31, 33, 35, 37, 39, 70, 112]
inputs = ["-framerate", str(FPS), "-i", str(frames / "f%05d.jpg"), "-i", str(root / "music.mp3")]
for _ in dings:
    inputs += ["-i", str(root / "ding.mp3")]
fc = f"[1:a]volume=0.6,afade=t=in:d=2,afade=t=out:st={DUR - 4}:d=4[m];"
for k, t in enumerate(dings):
    fc += f"[{k + 2}:a]adelay={int(t * 1000)}|{int(t * 1000)},volume=0.8[d{k}];"
fc += "[m]" + "".join(f"[d{k}]" for k in range(len(dings))) + f"amix=inputs={len(dings) + 1}:normalize=0,atrim=0:{DUR}[a]"
subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", fc, "-map", "0:v", "-map", "[a]",
                "-t", str(DUR), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                "-c:a", "aac", "-b:a", "160k", str(root / "qcm-major-promo.mp4")], check=True)
shutil.rmtree(frames, ignore_errors=True)
