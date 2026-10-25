# Diagnosis report: Canva error when connecting Facebook, and Gemini images not saving

## What I found in this project (read-only checks)
- The Arabic message "تعذر الاتصال بخادم ربط Canva التلقائي..." is **not anywhere in this project's code**.
- There is no `generate-gemini-image` function, no `media_assets` table use and no `google_gemini` provider in this project.
- The only Canva code is `src/routes/api/canva.ts`. It only sends Canva status codes back to the home page and has nothing to do with Facebook.
- `GEMINI_API_KEY` is not set here. Canva and Meta keys are not set either.

## Root cause
1. **Canva message when connecting Facebook:** it comes from a **different version of the app**, most likely the production project or the GitHub branch `restore/preview-meta-canva-20261016`. This project is not that one, so I can't name the exact line from here. What we know so far: in that version, the Facebook connect button most likely goes through the shared Canva/OAuth connection error message. That makes any connection failure look like a Canva failure.
2. **Gemini images not saving:** also in the other version. The function returns HTTP 200 with an error inside the reply (about 208 characters). The screen treats "200" as success and never checks the body, so nothing is saved and no error is shown. The most likely trigger is **a settings problem**: the Gemini key is missing or rejected. The **code** also has a flaw: it hides that failure.

## Files that need fixing (in the version that has these features)
- The Facebook connect handler, plus the file that holds the Canva error text: send Facebook errors to their own message.
- The `generate-gemini-image` function: return a real error status and a clear reason when the key is missing or Gemini fails.
- The code that calls it from the screen (the media library / poster studio): check the reply for success and an image before saving it to `media_assets`. Show the real error otherwise.

## Smallest safe fix
- Two or three small edits in the files above, plus one short test. No rebuild, no new packages, no database changes.
- Settings: add a valid `GEMINI_API_KEY` in the right place, done by you.

## Blocker
- These files are not in this project. To fix them, I need either the project that actually has them, or this project switched to the branch above.

## Expected cost
- A small, single-round fix once the right code is reachable. I can't give an exact credit number.
