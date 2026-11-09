# scripts/convert-player-photos.py
# Converte as fotos de jogador (PNG 200x200 do pacote do dono) para WebP leve, do tamanho que a carta usa.
# Lê do stdin uma lista JSON de {"src": caminho, "dst": caminho} e escreve um WebP por item, baixando a qualidade
# até caber no limite (15 KB). Chamado por scripts/import-player-photos.ts; precisa do Pillow (python3 -m pip install pillow).
import json
import sys

from PIL import Image

LIMIT = 15 * 1024
SIZE = 200
QUALITIES = (72, 64, 56, 48, 40)


def convert(src: str, dst: str) -> int:
    image = Image.open(src).convert("RGB")
    if image.width != SIZE or image.height != SIZE:
        image = image.resize((SIZE, SIZE), Image.LANCZOS)
    size = 0
    for quality in QUALITIES:
        image.save(dst, "WEBP", quality=quality, method=6)
        with open(dst, "rb") as handle:
            size = len(handle.read())
        if size <= LIMIT:
            break
    return size


def main() -> None:
    jobs = json.load(sys.stdin)
    sizes = [convert(job["src"], job["dst"]) for job in jobs]
    json.dump({"count": len(sizes), "bytes": sum(sizes), "largest": max(sizes, default=0)}, sys.stdout)


if __name__ == "__main__":
    main()
