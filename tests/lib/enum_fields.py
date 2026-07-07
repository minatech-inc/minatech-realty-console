# -*- coding: utf-8 -*-
"""協会Word様式のFORMTEXTフィールド序数・ラベル文脈を列挙する開発ツール
使い方: python enum_fields.py <docxパス> [開始序数] [終了序数]
        python enum_fields.py <docxパス> --verify '{"5":"値",...}'  # マーカー差し込み検証
"""
import zipfile, re, sys, json

def scan(path):
    xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf-8', 'ignore')
    events = [(m.start(), m.end(), m.group(1)) for m in
              re.finditer(r'<w:fldChar w:fldCharType="(begin|separate|end)"[^>]*/?>', xml)]
    instrs = [(m.start(), m.group(1)) for m in
              re.finditer(r'<w:instrText[^>]*>([^<]*)</w:instrText>', xml)]
    fields, stack = [], []
    for s, e, kind in events:
        if kind == 'begin':
            stack.append({'begin': s, 'sep': None, 'sepEnd': None})
        elif kind == 'separate' and stack:
            stack[-1]['sep'] = s; stack[-1]['sepEnd'] = e
        elif kind == 'end' and stack:
            f = stack.pop(); f['end'] = s
            is_text = any(f['begin'] < p < (f['sep'] or f['end']) and 'FORMTEXT' in t for p, t in instrs)
            if not stack and is_text:
                fields.append(f)
    return xml, fields

def label(xml, pos, n=38):
    t = re.sub(r'<[^>]+>', '', xml[:pos])
    return t[-n:].replace('\n', '').replace('FORMTEXT', '◇').replace('FORMDROPDOWN', '▽')

if __name__ == '__main__':
    path = sys.argv[1]
    xml, fields = scan(path)
    title = re.sub(r'<[^>]+>', '', xml)[:80].strip().replace('\n', '')
    print(f'様式: {title[:50]} / FORMTEXT数: {len(fields)}')
    if len(sys.argv) > 2 and sys.argv[2] == '--verify':
        mapping = json.loads(sys.argv[3])
        repls = []
        for k, v in mapping.items():
            f = fields[int(k)]
            seg = xml[f['sepEnd']:f['end']]
            m = re.search(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)', seg)
            if not m:
                print(f'T{k}: 結果ラン無し'); continue
            off = seg.index(m.group(0))
            repls.append((f['sepEnd'] + off + len(m.group(1)), f['sepEnd'] + off + len(m.group(1)) + len(m.group(2)), '【' + v + '】'))
        repls.sort(reverse=True)
        new = xml
        for s, e, v in repls:
            new = new[:s] + v + new[e:]
        plain = re.sub(r'<[^>]+>', '', new).replace('\n', '')
        for v in mapping.values():
            m = re.search('(.{26})【' + re.escape(v) + '】', plain)
            print(f"{v:22s} | …{m.group(1).replace('FORMTEXT','◇').replace('FORMDROPDOWN','▽') if m else '未挿入'}")
    else:
        lo = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        hi = int(sys.argv[3]) if len(sys.argv) > 3 else min(80, len(fields))
        for i in range(lo, min(hi, len(fields))):
            print(f'T{i:03d} | …{label(xml, fields[i]["begin"])}')
