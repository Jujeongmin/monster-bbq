# Prompts for Grandma's other eight old friends (staff design 9, second batch), written like the first four's
# (approved 2026-10-20): the same sheet, the same rules, the approved friends attached as the style to match.
#   python art-src/codex/make_staff_prompts2.py
F = {
    "hongmae": ("Hongmae, a hearty tavern hostess (jumo): black hair in a low bun held by ONE plain wooden hairpin, a broad laugh, a plain red hanbok jacket (jeogori) and a plain dark-navy long skirt. About as tall as the boy.",
                "WORK (pour): standing, holding a small white jug tilted down to the right over a small white bowl held in the other hand at chest height (no liquid stream beyond one or two pixels)."),
    "soedol": ("Soedol, a stiff, honest ironmonger: broad and sturdy, short black hair, thick eyebrows, a serious flat mouth; a plain white shirt with the sleeves rolled up, a plain brown leather apron, dark trousers and boots. A little taller than the boy.",
               "WORK (charcoal): standing, leaning forward a little, holding long iron tongs out to the right at waist height with one lump of charcoal in them (draw only the tongs and the lump)."),
    "ppareun": ("Quickfoot, a fidgety raccoon-dog yokai (neoguri) who carries the post: walks upright on two legs, brown fur, a dark mask around the eyes, a bushy tail with two dark rings, a plain canvas mail bag across the body. Clearly SHORTER than the boy (about four fifths of his height).",
                "WORK (serve): leaning forward mid-run to the right, holding one small round white plate of grilled meat up high on one paw."),
    "ggultteok": ("Granny Ggultteok, a kind little rice-cake seller: small and a bit stooped, grey hair in a bun, a gentle smile with closed eyes; a plain pale-green hanbok jacket and a plain brown long skirt, a small round flat bamboo tray of rice cakes balanced on her head. A little shorter than the boy.",
                  "WORK (offer): standing, holding out ONE small round rice cake to the right in both hands, offering it, a warm smile."),
    "jang": ("Jang, a quiet wandering cook: big and tall, short black hair, stubble, calm narrow eyes; a plain black fur vest with ONE small pale crescent on the chest (like a moon bear), a plain grey shirt, dark trousers and boots. Taller than the boy.",
             "WORK (grill): standing, holding long cooking tongs out to the right at chest height as if turning meat on a grill (draw only the tongs)."),
    "baekhwa": ("Baekhwa, a proud nine-tailed fox (gumiho) in human form: long silver-white hair, two silver fox ears, a cool half-smile; a plain white hanbok jacket and a plain pale-violet long skirt, ONE big fluffy silver tail behind her (only one tail shows). About as tall as the boy.",
                "WORK (serve): standing tall, holding one small round white plate of grilled meat out to the right on one hand, the other hand on her hip."),
    "baekdu": ("Old Baekdu, an easygoing mountain spirit (sansin): a long white beard to the chest, white eyebrows, white hair in a small topknot, kind half-closed eyes; a plain light-grey long robe with a plain dark sash, a plain wooden walking stick. About as tall as the boy.",
               "WORK (calm): standing, the walking stick in one hand, the other hand raised to the right palm out in a calm, soothing gesture."),
    "mumyeong": ("Mumyeong, a cool, nameless knife-cook: slim, black hair tied in a short topknot, a plain dark cloth mask over the lower face so only sharp eyes show; a plain charcoal-grey jacket and trousers, a plain dark sash, ONE plain kitchen knife in a sheath at the waist. About as tall as the boy.",
                 "WORK (chop): standing, leaning forward a little, one hand bringing a plain kitchen knife down to the right at waist height as if chopping (draw only the knife)."),
}
COMMON = """Use your image generation tool (do not write code to draw) to create ONE image: a sprite sheet of ONE new character for a cozy, comic Korean BBQ restaurant game — a friend of the shop who works beside the boy in the attached pictures.

STYLE — the most important rule: the new character must look like they belong in the SAME game. The first picture is the boy's walk strip; the second shows an approved friend drawn the right way. Copy their art style exactly: the same chunky cute chibi proportions (big head, small body), the same dark 1-art-pixel outline, the same pixel size (every art pixel an exact crisp square block on one even grid), FLAT colours with only 2-3 shades per material, the same warm muted palette, NO gradients, NO glow, NO soft shading, NO anti-aliasing, NO texture noise. Keep the design SIMPLE and readable at a glance: a clear silhouette and only the features described below. NO extra accessories, NO patterns, NO jewellery, NO badges, NO effects. Plain clothes in two or three flat colours.

THE CHARACTER: {look}

Save as art-src/codex/raw/staff_{id}.png — exactly 1920x384: 5 equal square cells (384x384) in one row, one full-body pose centred in each cell, the feet on the same baseline near the bottom of the cell, at the SAME scale as the boy's walk strip and the approved friend. Background: one perfectly flat solid magenta #FF00FF everywhere (no shadow, no floor). No text, no grid lines, no motion lines, no sparkles. No pose touches its cell edge.

FACING for every frame: pure side profile facing camera-RIGHT, like the walk strip.

cells 1-4 WALK (a 4-frame walk to the right, exactly the leg pattern of the walk strip), hands empty, a light natural arm swing:
cell 1: near leg forward, heel down; far leg back on its toe.
cell 2: passing, legs together under the body, body one pixel higher.
cell 3: far leg forward, heel down; near leg back on its toe.
cell 4: passing, body one pixel higher.
cell 5 {work}

Reply only with the saved file path.
"""
PORTRAIT = """Use your image generation tool (do not write code to draw) to create ONE image: four RPG portraits for a cozy, comic Korean BBQ restaurant game, shown on character cards beside the approved portraits in the attached picture.

STYLE — the most important rule: match the attached approved portraits EXACTLY so all portraits look like one set: the same pixel size (every art pixel a crisp 6x6 block on a 6-pixel grid), the same 1-art-pixel dark outline, flat colours with 2-3 tone cel shading, one small highlight, NO gradients, NO glow, NO soft shading, NO anti-aliasing, NO texture noise. Keep each design SIMPLE: only the features described, NO extra accessories, NO patterns, NO jewellery, NO background details.

Each portrait: head and shoulders (a bust cut at the chest), facing slightly RIGHT, cute chibi proportions (big head), the whole bust about 60 art pixels tall and 70 art pixels wide (360x420 image pixels at most), a calm expression that shows the personality.

Save as art-src/codex/raw/staff_portraits_{n}.png — exactly 1440x1152: a grid of 2 columns x 2 rows of equal cells (720x576), one bust centred in each with the chest cut on the same baseline near the bottom of the cell. Background: one perfectly flat solid magenta #FF00FF everywhere (no halo, no shadow). No text, no frames, no grid lines. Nothing touches its cell edge.

{cells}

Reply only with the saved file path.
"""
SPOTS = ["cell 1 (top left)", "cell 2 (top right)", "cell 3 (bottom left)", "cell 4 (bottom right)"]

if __name__ == "__main__":
    for fid, (look, work) in F.items():
        open(f"art-src/codex/prompt-staff-{fid}.txt", "w", encoding="utf-8").write(COMMON.format(id=fid, look=look, work=work))
    for n, ids in ((2, ["hongmae", "soedol", "ppareun", "ggultteok"]), (3, ["jang", "baekhwa", "baekdu", "mumyeong"])):
        # the bust's description: the look up to its first clothes, without the height note
        cells = "\n".join(f"{SPOTS[i]} {F[fid][0].split(' About')[0].split(' Clearly')[0].split(' Taller')[0].split(' A little')[0]}" for i, fid in enumerate(ids))
        open(f"art-src/codex/prompt-staff-portraits-{n}.txt", "w", encoding="utf-8").write(PORTRAIT.format(n=n, cells=cells))
    print("ok")
