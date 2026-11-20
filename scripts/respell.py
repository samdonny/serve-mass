"""Latin (ecclesiastical) → spelling an Italian neural voice reads correctly.
Stress marks (grave accent on the stressed vowel) where Latin stresses the antepenult or
where an Italian reader would guess wrong; then ecclesiastical sound rules (ae→e, ti+vowel→zi, j→i…)."""
import re, unicodedata

def strip_acc(w):
    return ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')

STRESS = {strip_acc(w): w for w in """
dòminus dòmine dòmini dòmino dòminum spìritu spìritus spirìtui sècula omnìpotens ànima tabernàcula cìthara
adjutòrium nòmine indulgèntiam trìbuat misèricors misericòrdiam misericòrdiae sequèntia evangèlii sacrifìcium
acceptàbile gràtias gràtiae gràtia fìlius fìlio fìlii inìtium mulièribus gènetrix sacratìssimum mìchael archàngele
archàngelo archàngelum laetìficat quòniam princìpio confìteor vìrgini vìrginem apòstolis apòstolos òmnibus òpere
màxima ìdeo laetàbitur vèniat kỳrie glòria glòriam suscìpiat mànibus nòminis totiùsque eccl­èsiae lìbera sanàbitur
sìngulis benedìcere èxsules oculos òculos exsìlium promissiònibus praèlio nequìtiam insìdias diàboli praesìdium
ìmperet sùpplices sàtanam aliòsque misèrere èia eléison càusam cònturbas dìscerne dòloso ìpsa tènebrae
""".replace('­', '').split()}
STRESS['oculos'] = 'òculos'
# Michael: a-e are two vowels, not the diphthong ae (MEE-ka-el); written so the ae rule can't touch them
STRESS['michael'] = 'mìcael'; STRESS['michaeli'] = 'micaèli'; STRESS['michaelem'] = 'micaèlem'
STRESS['ecclesiae'] = 'ecclèsiae'
STRESS['kyrie'] = 'chìrie'
STRESS['conturbas'] = 'contùrbas'
STRESS['doloso'] = 'dolòso'
STRESS['causam'] = 'càusam'
STRESS['discerne'] = 'discèrne'
STRESS['ipsa'] = 'ìpsa'


def word(w):
    m = re.match(r"^([^A-Za-zæœÆŒ]*)([A-Za-zæœÆŒ]+)([^A-Za-zæœÆŒ]*)$", w)
    if not m: return w
    pre, core, post = m.groups()
    low = core.lower().replace('æ', 'ae').replace('œ', 'oe')
    out = STRESS.get(low, low)
    # ecclesiastical sounds, written the Italian way
    if not (out.startswith('mìcael') or out.startswith('micaèl')):
        out = out.replace('ae', 'e').replace('aè', 'è')
    out = out.replace('oe', 'e').replace('ph', 'f').replace('th', 't').replace('y', 'i').replace('ỳ', 'ì')
    out = re.sub(r'j', 'i', out)
    out = re.sub(r'(?<![stx])t(?=[iì][aeiouàèìòù])', 'z', out)       # gratias → grazias, but not "ostium"
    out = re.sub(r'^h(?=[aeiouàèìòù])', '', out)                       # habemus → abemus (silent h)
    out = re.sub(r'(?<=[aeiouàèìòù])h(?=[aeiouàèìòù])', '', out)       # mihi → mii
    out = out.replace('k', 'c')
    if core[0].isupper(): out = out[0].upper() + out[1:]
    return pre + out + post

def respell(text):
    text = re.sub(r'\s*\([^)]*\)\s*', ' ', text).replace('…', '').replace('—', ',').strip()
    return ' '.join(word(w) for w in text.split())

if __name__ == '__main__':
    import json, sys
    d = json.load(open(sys.argv[1]))
    for t in d['father'] + d['server']: print(respell(t))
