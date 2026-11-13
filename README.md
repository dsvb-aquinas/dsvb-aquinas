# DSVB study site

Plain files, no build step, no Python. What you see in the folder is what gets published.

## Put it online (GitHub Pages)

1. Make a free account at github.com and create a new repository (public), for example `dsvb`.
2. Upload everything inside this folder, keeping the structure. Drag the files into the repository page, or use GitHub Desktop.
3. In the repository go to Settings, then Pages. Under Source pick "Deploy from a branch", branch `main`, folder `/ (root)`, and Save.
4. After a minute your site is live at `https://YOURNAME.github.io/dsvb/`.

Yes, GitHub Pages supports many pages. Any file or folder you upload becomes part of the site.

## Add a new text

1. Make a folder `books/yourbook/` and put in `book.txt` (the full text, plain). Optional: `summary.txt`.
2. Add one line to `books/books.json`:
   `{ "id": "yourbook", "title": "Title", "author": "Name", "year": "1900" }`
   The `id` must match the folder name. Mind the comma between entries.
3. Upload. It appears on the home page by itself, and opens at `reader.html?b=yourbook`.

Scanned PDFs have no real text, so they need OCR first. Text from a normal PDF can be copied into a .txt file.

## Files

- `index.html` home page and list of texts
- `reader.html` and `assets/reader.js` the question and answer page, shared by every text
- `assets/web-llm.js` the AI engine, kept here so the site works offline
- `sw.js` saves the site on the device after the first visit
- `assets/dsvb-logo*.js` your logos

If you change files after people have visited, bump the number in `sw.js` (`dsvb-v1` to `dsvb-v2`) so their devices refresh.
