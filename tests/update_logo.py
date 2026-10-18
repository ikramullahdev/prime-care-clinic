import glob
import re

html_files = glob.glob('*.html')
print(f'Found {len(html_files)} HTML files.')

target_old = '<div class="logo-icon">+</div>'
replacement_new = '<img src="assets/images/clinic-logo-circle.png" alt="Prime Care Clinic Logo" class="logo-img" width="44" height="44">'

for fpath in html_files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace logo-icon
    new_content = content.replace(target_old, replacement_new)

    # In admin.html, adjust gear icon in logo if present
    new_content = new_content.replace(
        '<div class="logo-icon">⚙</div>',
        replacement_new
    )

    # Replace favicon
    new_content = re.sub(
        r'<link rel="icon" type="image/[^"]+" href="[^"]+">',
        '<link rel="icon" type="image/png" href="assets/images/favicon.png">',
        new_content
    )

    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f'Updated {fpath}')

print('All pages successfully updated with official clinic logo!')
