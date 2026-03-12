# ScriptGraph

Structural analysis of screenplays. Tension arcs, key moments, act structure — for writers who want to understand how stories are built.

## Local Development

```bash
npm install
npm run dev
```

Create a `.env.local` file (see `.env.example`) with your Anthropic API key before running locally.

## Adding Scripts to the Public Library

1. Run a script analysis in your local app
2. Use the Export JSON button on the results screen
3. Save the file to `public/library/`
4. Commit and push — Vercel deploys automatically

## Deployment

Deployed on Vercel. Environment variables are set in the Vercel dashboard:
- `VITE_ANTHROPIC_KEY` — Anthropic API key
- `VITE_PUBLIC_MODE` — set to `true` on production
