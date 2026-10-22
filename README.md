# Skill Compass

A generative-AI career guide for young people with little or no formal work experience. In two short steps they describe what they have done **in their own words**: school, a family shop, tutoring, volunteering, gaming. The tool shows them:

1. **Skills they already have**, each backed by a verbatim quote from their own story
2. **What their target field needs**, grouped into technical skills, tools and software, soft skills, knowledge and qualifications, and experience, with their status for each (have / partly / to build) and a concrete next step
3. **A 3-stage roadmap** (next 2 weeks, 1–3 months, 3–6 months)
4. **Honest CV lines and a STAR interview story**, built only from facts in their story

**SDG link:** SDG 8, Decent work (target 8.6: reduce the share of youth not in employment, education or training) and SDG 4, Quality education (target 4.4: more youth with skills relevant for employment).
**Target users:** young people who think they have "nothing to put on a CV", for example vocational-school graduates, NEET youth, and students without internships.

## What makes it different: no inflated CVs

Every claim is checked **in code, not by the model**:

| Check | How | Shown as |
|---|---|---|
| Skill evidence | Each skill's quote is searched in the user's story; found quotes are highlighted. | `✓ you said` / `! not in your story` |
| Requirement source | With a job ad pasted, each requirement must quote the ad. Without an ad, requirements are labelled as general guidance. | `✓ in the ad` / `general guidance` |
| "You have it" claims | A have/partly status needs a quote from the story; otherwise it is downgraded to *Unverified*. | `Unverified` |
| CV numbers | Every number in a CV line or STAR story must appear in the story. | `This number is not in your story: …` |

"Copy CV lines" copies only the lines that passed the checks.

## Use it / deploy it (free, anyone can use it, no account or key for users)

The app is one page (`index.html`) plus one small server function (`api/analyze.js`) that keeps the API key on the server. Users just open the link. **Total cost: 0**, using Vercel's free plan and the Gemini API's free tier.

1. **Get a free Gemini API key:** go to aistudio.google.com, sign in with a Google account, choose **Get API key → Create API key** and copy it. Billing is only needed to upgrade to a paid tier.
2. **Put the code on GitHub:** create a repository and upload the contents of this folder.
3. **Deploy on Vercel:** sign in at vercel.com with GitHub, choose **Add New → Project**, import the repository and keep the defaults (there is no build step).
4. **Add the key:** go to **Settings → Environment Variables** and add `GEMINI_API_KEY` = your key. Then go to **Deployments → Redeploy**.
5. Share the `https://<project>.vercel.app` link.

Notes:
- The default model is `gemini-2.5-flash`. If Google renames its free models, set `GEMINI_MODEL` to the current free model shown in AI Studio.
- The free tier has per-minute and per-day request limits. That is fine for a demo, but not for heavy public use. When the limit is hit, users see "Too many requests, try again in a minute".
- Free-tier prompts may be used by Google to improve its products, so the page tells users not to write names, ID numbers or addresses.
- To use Claude instead (paid), set `ANTHROPIC_API_KEY` and leave `GEMINI_API_KEY` empty.

**Other ways to run it:** the published claude.ai artifact (uses the viewer's own Claude account), or opening `index.html` locally with an API key in the optional box.

## Repo layout

```
index.html          the app (single file, EN/TR interface)
api/analyze.js      server function: builds the same prompt, calls Gemini (free) or Claude, returns JSON
prompts/            the prompt and why it is written that way
docs/report.pdf     2-page report
```

## Limits

Guidance, not a guarantee. Requirements without an ad come from the model's general knowledge and can be outdated, so compare them with several real ads. The page does not store the user's story.
