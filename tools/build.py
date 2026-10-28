"""Build the standalone dashboard from repository-relative files."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def render():
    data = json.loads((ROOT / 'data/snapshot.json').read_text(encoding='utf-8'))
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    access = json.loads((ROOT / 'data/access.json').read_text(encoding='utf-8'))
    if any('password' in a for a in access['accounts']):
        raise ValueError('Plaintext passwords must never be included in the public build')
    access_payload = json.dumps(access, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    template = (ROOT / 'src/dashboard.template.html').read_text(encoding='utf-8')
    replacements = {
        '/*__STYLES__*/': (ROOT / 'src/dashboard.css').read_text(encoding='utf-8'),
        '/*__DATA__*/': payload,
        '/*__ACCESS__*/': access_payload,
        '/*__AUTH__*/': (ROOT / 'src/auth.js').read_text(encoding='utf-8'),
        '/*__SCRIPT__*/': (ROOT / 'src/dashboard.js').read_text(encoding='utf-8'),
    }
    for marker, content in replacements.items():
        if template.count(marker) != 1:
            raise ValueError(f'Expected one template marker: {marker}')
        template = template.replace(marker, content)
    return template


if __name__ == '__main__':
    (ROOT / 'index.html').write_text(render(), encoding='utf-8')
    print('Built index.html')

