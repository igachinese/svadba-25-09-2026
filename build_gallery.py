import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from PIL import Image, ImageOps

SOURCE_ROOT = Path(r"C:\Users\Administrator\Downloads\2026-09-25 Свадьба\2026-09-25 Свадьба")
PROJECT_ROOT = Path(__file__).resolve().parent

FOLDERS = [
    ("zags", "Загс"),
    ("banquet-1", "Банкет часть 1"),
    ("banquet-2", "Банкет часть 2"),
]

THUMB_MAX = 720
THUMB_QUALITY = 76
VIEW_MAX = 2000
VIEW_QUALITY = 82
WEBP_METHOD = 3
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def normalize_name(name: str) -> str:
    return " ".join(name.replace("\xa0", " ").split()).lower()


def find_source_folder(target_title: str) -> Path:
    wanted = normalize_name(target_title)
    for entry in SOURCE_ROOT.iterdir():
        if entry.is_dir() and normalize_name(entry.name) == wanted:
            return entry
    raise FileNotFoundError(f"Source folder not found: {target_title} in {SOURCE_ROOT}")


def process_image(task: tuple[str, str, str, str]) -> dict:
    folder_id, src_path_str, thumb_path_str, view_path_str = task
    src_path = Path(src_path_str)
    thumb_path = Path(thumb_path_str)
    view_path = Path(view_path_str)

    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    view_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src_path) as raw_im:
        im = ImageOps.exif_transpose(raw_im)
        if im.mode != "RGB":
            im = im.convert("RGB")

        view_im = im.copy()
        view_im.thumbnail((VIEW_MAX, VIEW_MAX), Image.Resampling.LANCZOS)
        w, h = view_im.size
        if not view_path.exists():
            view_im.save(view_path, "WEBP", quality=VIEW_QUALITY, method=WEBP_METHOD)

        if not thumb_path.exists():
            thumb_im = im.copy()
            thumb_im.thumbnail((THUMB_MAX, THUMB_MAX), Image.Resampling.LANCZOS)
            thumb_im.save(thumb_path, "WEBP", quality=THUMB_QUALITY, method=WEBP_METHOD)

    return {
        "folder_id": folder_id,
        "name": src_path.name,
        "w": w,
        "h": h,
        "thumb": f"media/{folder_id}/thumbs/{thumb_path.name}",
        "src": f"media/{folder_id}/photos/{view_path.name}",
    }


def main() -> None:
    t0 = time.time()
    tasks = []
    folder_meta = []

    for folder_id, folder_title in FOLDERS:
        src_dir = find_source_folder(folder_title)
        files = sorted(
            [p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_EXTS],
            key=lambda p: p.name.lower(),
        )
        folder_meta.append((folder_id, folder_title, len(files)))
        for src_file in files:
            stem = src_file.stem
            thumb_file = PROJECT_ROOT / "media" / folder_id / "thumbs" / f"{stem}.webp"
            view_file = PROJECT_ROOT / "media" / folder_id / "photos" / f"{stem}.webp"
            tasks.append((folder_id, str(src_file), str(thumb_file), str(view_file)))

    total = len(tasks)
    print(f"Found {total} photos across 3 folders (excluding Прогулка).", flush=True)

    results_by_folder: dict[str, list[dict]] = {fid: [] for fid, _ in FOLDERS}
    workers = min(8, os.cpu_count() or 4)
    done = 0

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(process_image, t) for t in tasks]
        for fut in as_completed(futures):
            item = fut.result()
            results_by_folder[item["folder_id"]].append(item)
            done += 1
            if done % 100 == 0 or done == total:
                elapsed = time.time() - t0
                print(f"Processed {done}/{total} ({elapsed:.1f}s)...", flush=True)

    folders_out = []
    cover_src = ""

    for folder_id, folder_title in FOLDERS:
        items = sorted(results_by_folder[folder_id], key=lambda x: x["name"].lower())
        photos = [
            {
                "name": it["name"],
                "w": it["w"],
                "h": it["h"],
                "thumb": it["thumb"],
                "src": it["src"],
            }
            for it in items
        ]
        if not cover_src:
            landscape = next((p for p in photos if p["w"] > p["h"]), None)
            cover_src = (landscape or (photos[0] if photos else {})).get("src", "")

        folders_out.append({
            "id": folder_id,
            "title": folder_title,
            "photos": photos,
        })

    data_dir = PROJECT_ROOT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {"cover": cover_src, "folders": folders_out}
    out_js = data_dir / "gallery.js"
    out_js.write_text(
        "window.GALLERY_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    total_bytes = sum(
        p.stat().st_size
        for p in (PROJECT_ROOT / "media").rglob("*")
        if p.is_file()
    )
    print(
        f"Done in {time.time() - t0:.1f}s! Total media size: {total_bytes / (1024 * 1024):.2f} MB",
        flush=True,
    )


if __name__ == "__main__":
    main()
