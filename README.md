# HabitFlow — Qur'an & Mutūn Ḥifẓ Studio

Line-by-line memorization of the Madinah Muṣḥaf and of Shaykh ʿAbd al-Muḥsin al-Qāsim's mutūn,
with a prayer-based daily plan (Umm al-Qura times), spaced muraja'ah, reminders and a habit tracker.

## What's inside

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app |
| `data/quran-1441.json` | Madinah Muṣḥaf **1440–1441 print** (default) — 604 pages, 15 lines, King Fahd Complex layout |
| `data/quran-1421.json`, `data/quran-1405.json` | The older 1421 and 1405 prints |
| `data/mutun/*.json` | The nine mutūn: every printed line of the Shaykh's edition (position on the page), the reference text for that line, and where it is read in aṣ-Ṣīnī's recording |
| `vendor/` | adhan-js (prayer times), pdf.js (shows the Shaykh's pages) |
| `manifest.json`, `sw.js`, `icons/` | Installable website that also works offline |
| `.github/workflows/build-apk.yml` | GitHub builds the Android APK |

### The mutūn

| Book | Edition | Reading |
|---|---|---|
| ثلاثة الأصول وأدلتها · القواعد الأربع · نواقض الإسلام · الأربعون النووية (50, with Ibn Rajab's 8) | al-Qāsim, Level 2 | ʿAbd al-ʿAzīz aṣ-Ṣīnī |
| كتاب التوحيد | al-Qāsim, Level 3 | aṣ-Ṣīnī (he does not read the فيه مسائل; they are optional in the app) |
| العقيدة الواسطية | al-Qāsim, Level 4 | aṣ-Ṣīnī |
| بلوغ المرام | al-Qāsim, Level 6 | aṣ-Ṣīnī |
| عمدة الأحكام | al-Qāsim, Additional mutūn 2 | aṣ-Ṣīnī |
| أصول السنة (رواية عبدوس) | ed. Dr. Muḥammad Hishām Ṭāhirī | none verified — add your own |

The Shaykh's PDFs and recordings are **not** in this repository: they are copyrighted ("حقوق الطبع
محفوظة") and free to download from his website. The app shows his printed pages from PDFs **you add on
your own phone** (Settings → Mutūn books & files → *Add PDFs / MP3s*; pick all of them at once). The readings
stream from `files.a-alqasim.com`; add the MP3s too if you want them offline. Without the PDFs the
mutūn still work in *Text* view, on the same lines.

## 1. Put it online with GitHub Pages

1. Create a repository on github.com (e.g. `habitflow`). It must be **Public** on a free account.
2. Upload *everything* in this folder, including the hidden `.github` folder.
3. **Settings → Pages → Deploy from a branch → main → / (root) → Save.**
4. After a minute the app is at `https://<your-username>.github.io/habitflow/`.

## 2. Let GitHub build the APK

The workflow runs whenever app files change (or **Actions → Build Android APK → Run workflow**).
When it's green: **Releases** → newest **HabitFlow APK** → download **HabitFlow.apk** on your phone.

One-time setup (before the first build):
- **Settings → Secrets and variables → Actions → New repository secret**, name
  `ANDROID_DEBUG_KEYSTORE_BASE64`, value: the contents of `HabitFlow-signing-key-SECRET.txt`
  (never upload that file). Same key every build = updates install without losing data.
- **Settings → Actions → General → Workflow permissions → Read and write**.

## Which Muṣḥaf print do I have?

Open your Muṣḥaf at **page 76**. If the page ends with the title of Sūrat an-Nisāʾ, it is the 1421 (or
1405) print; if an-Nisāʾ begins at the top of page 77, it is the **1440–1441** print. Then page 586:
Sūrat at-Takwīr at the top of the page means 1405.

## Updating

Upload the changed files. If you change `sw.js`, bump `CACHE_VERSION` so phones refresh their offline copy.

## Your data

Progress is saved on the device. Settings → Backup exports/imports it (PDFs and recordings are not part
of the backup — add them again on a new phone). The website and the APK keep separate data.
