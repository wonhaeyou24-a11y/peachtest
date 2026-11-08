import os
base = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(base, '..', 'index.html'), encoding='utf-8').read()


def fn(h):
    i = src.index(h)
    j = src.index('{', src.index(')', i))
    depth = 0
    k = j
    s = None
    while k < len(src):
        c = src[k]
        if s:
            if c == '\\':
                k += 2
                continue
            if c == s:
                s = None
        elif c in '"\'`':
            s = c
        elif c == '/' and src[k + 1] == '/':
            k = src.index('\n', k)
            continue
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return src[i:k + 1]
        k += 1


code = '\n'.join(fn(h) for h in ['async function priorImportPhotoZip(', 'async function priorResizeToBlob(', 'function priorProgress('])
open(os.path.join(base, '_zip_fns.js'), 'w', encoding='utf-8').write(code)
print(len(code))
