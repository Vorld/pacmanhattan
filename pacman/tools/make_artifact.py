"""Bundle index.html + src + data into one self-contained page body for claude.ai Artifacts."""
import re, os
html = open('index.html').read()
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'<meta[^>]*>\s*', '', head)
head = head.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + open('src/style.css').read() + '</style>')
def inline(m):
    return '<script>\n' + open(m.group(1)).read().replace('</script', '<\\/script') + '\n</script>'
body = re.sub(r'<script src="(?!https?:)([^"]+)"></script>', inline, body)
os.makedirs('dist', exist_ok=True)
open('dist/pac-manhattan.html', 'w').write(head.strip() + '\n' + body)
print(round(os.path.getsize('dist/pac-manhattan.html') / 1e6, 2), 'MB')
