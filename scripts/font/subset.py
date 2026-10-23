# 見出し用の明朝（UI Mincho）を作る（決定事項 #111）。scripts/gen-display-font.mjs から呼ぶ。
#   python3 subset.py <元の TTF> <字のファイル（UTF-8）> <出力 .woff2>
# 元の書体から要る字だけを切り出し、palt（字形の余白を詰める）を残して woff2 で書き出す。
# 出力（標準出力）：切り出したフォントに入った字のコードポイント（JSON の配列）
import json
import sys

from fontTools import subset
from fontTools.ttLib import TTFont


def main():
    src, chars_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    chars = open(chars_path, encoding='utf8').read()
    cps = sorted({ord(c) for c in chars if ord(c) > 32})
    opts = subset.Options()
    opts.layout_features = ['palt', 'vpal', 'kern', 'liga', 'mark', 'mkmk']
    opts.notdef_outline = True
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.flavor = 'woff2'
    f = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(f)
    f.flavor = 'woff2'
    f.save(out)
    g = TTFont(out)
    feats = sorted({fr.FeatureTag for fr in g['GPOS'].table.FeatureList.FeatureRecord}) if 'GPOS' in g else []
    if 'palt' not in feats:
        raise SystemExit('subset.py: palt が残っていません')
    print(json.dumps(sorted(g.getBestCmap().keys())))


main()
