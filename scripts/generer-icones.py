"""Génère toutes les icônes (Android et site) depuis resources/icone-source.png.

Usage : python scripts/generer-icones.py   (Pillow requis)

Source : logo « hay » blanc sur dégradé horizontal bleu-violet-rose. Le dégradé est reconstitué colonne par
colonne (moyenne des bandes du haut et du bas), ce qui permet d'extraire le logo seul (premier plan de
l'icône adaptative Android, icône de notification) et de redessiner le fond à n'importe quelle taille.
Source de moins de 1024 px : agrandie en 1024 px (Lanczos, puis léger renforcement de netteté).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "resources" / "icone-source.png"
RES = RACINE / "android" / "app" / "src" / "main" / "res"
PUBLIC = RACINE / "public"
TAILLE = 1024
DENSITES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def charger_source():
    im = Image.open(SOURCE).convert("RGBA")
    if im.width != im.height:
        cote = min(im.size)
        im = im.crop(((im.width - cote) // 2, (im.height - cote) // 2, (im.width + cote) // 2, (im.height + cote) // 2))
    if im.width < TAILLE:
        im = im.resize((TAILLE, TAILLE), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    elif im.width > TAILLE:
        im = im.resize((TAILLE, TAILLE), Image.LANCZOS)
    return im


def degrade_colonnes(im, bande=24):
    """Couleur du fond pour chaque colonne : moyenne des bandes haute et basse (hors logo)."""
    px = im.load()
    cols = []
    for x in range(im.width):
        ech = [px[x, y] for y in list(range(bande)) + list(range(im.height - bande, im.height))]
        cols.append(tuple(sum(c[i] for c in ech) / len(ech) for i in range(3)))
    # lissage : supprime le bruit de compression
    lisse = []
    for x in range(len(cols)):
        f = cols[max(0, x - 6): x + 7]
        lisse.append(tuple(sum(c[i] for c in f) / len(f) for i in range(3)))
    return lisse


def fond(taille, cols):
    """Dégradé horizontal redessiné à la taille voulue."""
    ligne = Image.new("RGB", (len(cols), 1))
    ligne.putdata([tuple(int(round(v)) for v in c) for c in cols])
    return ligne.resize((taille, taille), Image.BILINEAR).convert("RGBA")


def extraire_logo(im, cols):
    """Logo seul (fond transparent) : alpha déduit de l'écart au dégradé, couleur dé-prémultipliée."""
    px = im.load()
    out = Image.new("RGBA", im.size)
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            fr, fg, fb = cols[x]
            # le logo est blanc / lavande clair : l'écart vers le blanc donne l'opacité
            a = max((v - f) / max(1.0, 255 - f) for v, f in ((r, fr), (g, fg), (b, fb)))
            a = 0.0 if a < 0.12 else min(1.0, (a - 0.12) / 0.88)
            if a <= 0:
                continue
            c = [min(255, max(0, round((v - (1 - a) * f) / a))) for v, f in ((r, fr), (g, fg), (b, fb))]
            po[x, y] = (c[0], c[1], c[2], round(a * 255))
    return out


def logo_dans(logo, taille, part):
    """Logo recadré à son contenu, centré, sa plus grande dimension = `part` du carré."""
    boite = logo.getbbox()
    l = logo.crop(boite)
    echelle = part * taille / max(l.size)
    l = l.resize((max(1, round(l.width * echelle)), max(1, round(l.height * echelle))), Image.LANCZOS)
    toile = Image.new("RGBA", (taille, taille))
    toile.alpha_composite(l, ((taille - l.width) // 2, (taille - l.height) // 2))
    return toile


def arrondi(im, rayon_part):
    masque = Image.new("L", im.size, 0)
    ImageDraw.Draw(masque).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=round(im.width * rayon_part), fill=255)
    out = im.copy()
    out.putalpha(masque)
    return out


def rond(im):
    masque = Image.new("L", im.size, 0)
    ImageDraw.Draw(masque).ellipse((0, 0, im.width - 1, im.height - 1), fill=255)
    out = im.copy()
    out.putalpha(masque)
    return out


def main():
    src = charger_source()
    cols = degrade_colonnes(src)
    logo = extraire_logo(src, cols)
    carre = fond(TAILLE, cols)
    carre.alpha_composite(logo_dans(logo, TAILLE, 0.80))  # icône pleine (legacy, site)
    maskable = fond(TAILLE, cols)
    maskable.alpha_composite(logo_dans(logo, TAILLE, 0.62))  # zone sûre « maskable » (cercle de 80 %)

    for nom, d in DENSITES.items():
        dossier = RES / f"mipmap-{nom}"
        legacy = round(48 * d)
        arrondi(carre, 0.18).resize((legacy, legacy), Image.LANCZOS).save(dossier / "ic_launcher.png")
        rond(carre).resize((legacy, legacy), Image.LANCZOS).save(dossier / "ic_launcher_round.png")
        # Icône adaptative : 108 dp, zone sûre = cercle de 66 dp -> logo sur 60 dp.
        adapt = round(108 * d)
        logo_dans(logo, TAILLE, 60 / 108).resize((adapt, adapt), Image.LANCZOS).save(dossier / "ic_launcher_foreground.png")
        fond(adapt, cols).convert("RGB").save(dossier / "ic_launcher_background.png")
        # Android 13+ (icônes à thème) : silhouette du logo, même cadrage que le premier plan.
        mono = logo_dans(logo, TAILLE, 60 / 108).getchannel("A").point(lambda v: 0 if v < 90 else min(255, (v - 90) * 3))
        blanc = Image.new("RGBA", mono.size, (255, 255, 255, 0))
        blanc.putalpha(mono)
        blanc.resize((adapt, adapt), Image.LANCZOS).save(dossier / "ic_launcher_monochrome.png")

    # Icône de notification (barre d'état) : silhouette blanche du logo, 24 dp.
    # Silhouette nette : le bruit de faible opacité du dégradé est supprimé (seuil), le reste est plein.
    alpha = logo_dans(logo, TAILLE, 0.92).getchannel("A").point(lambda v: 0 if v < 90 else min(255, (v - 90) * 3))
    stat = Image.new("RGBA", alpha.size, (255, 255, 255, 0))
    stat.putalpha(alpha)
    for nom, d in DENSITES.items():
        dossier = RES / f"drawable-{nom}"
        dossier.mkdir(exist_ok=True)
        stat.resize((round(24 * d), round(24 * d)), Image.LANCZOS).save(dossier / "ic_stat_chay.png")

    # Site : manifeste, favicon, apple-touch-icon.
    carre.resize((192, 192), Image.LANCZOS).save(PUBLIC / "branding" / "icon-192.png")
    carre.resize((512, 512), Image.LANCZOS).save(PUBLIC / "branding" / "icon-512.png")
    maskable.resize((512, 512), Image.LANCZOS).save(PUBLIC / "branding" / "icon-maskable-512.png")
    carre.convert("RGB").resize((180, 180), Image.LANCZOS).save(PUBLIC / "branding" / "apple-touch-icon.png")
    petit = arrondi(carre, 0.2)
    for f in ("favicon-light.png", "favicon-dark.png"):
        petit.resize((64, 64), Image.LANCZOS).save(PUBLIC / "assets" / f)
    petit.resize((64, 64), Image.LANCZOS).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("Icônes générées.")


if __name__ == "__main__":
    main()
