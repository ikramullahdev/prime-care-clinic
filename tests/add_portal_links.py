import glob

html_files = [f for f in glob.glob('*.html') if f not in ['login.html', 'admin.html', 'index.html']]
print('Updating files:', len(html_files))

target = '<a href="appointment.html" class="header-cta">'
replacement = '<a href="login.html" class="nav-link" style="color: var(--color-teal); font-weight: 600;">🔒 Staff Portal</a>\n        <a href="appointment.html" class="header-cta">'

for fpath in html_files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'login.html' not in content:
        content = content.replace(target, replacement, 1)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Added Staff Portal link to {fpath}')

print('All pages updated!')
