import codecs

path = 'src/app/admin/(panel)/ia/whatsapp/page.tsx'

# Read raw bytes
with open(path, 'rb') as f:
    raw = f.read()

# The file was double-UTF8 encoded at some point.
# Strategy: decode as utf-8, then the mojibake chars are literal Unicode chars in the string.
# Then replace those literal chars.
with codecs.open(path, 'r', 'utf-8') as f:
    content = f.read()

replacements = {
    '\u00c2\u00b7': '\u00b7',          # Â· -> ·
    '\u00e2\u0080\u0094': '\u2014',   # â€” -> —
    '\u00f0\u009f\u009f\u00a2': '\u0001f7e2',  # ðŸŸ¢ -> 🟢
    '\u00f0\u009f\u0091\u00a4': '\u0001f464',  # ðŸ‘¤ -> 👤
    '\u00f0\u009f\u009a\u00ab': '\u0001f6ab',  # ðŸš« -> 🚫
    '\u00f0\u009f\u0094\u00b4': '\u0001f534',  # ðŸ”´ -> 🔴
    '\u00f0\u009f\u00a4\u0096': '\u0001f916',  # ðŸ¤– -> 🤖
    # The warning sign is trickier - it's split across bytes
}

for bad, good in replacements.items():
    if bad in content:
        content = content.replace(bad, good)
        print(f'Replaced: {repr(bad)} -> {repr(good)}')

# Handle the warning sign separately - it might be split
# Look for the pattern around it
if '\u00e2\u009a\u00a0' in content:
    # âš -> ⚠ but need to also handle the variation selector
    content = content.replace('\u00e2\u009a\u00a0\u00ef\u00b8\u008f', '\u26a0\ufe0f')
    print('Replaced warning sign')

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(content)

print('Done')
